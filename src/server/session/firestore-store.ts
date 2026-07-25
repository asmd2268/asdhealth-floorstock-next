import "server-only";

import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminApp } from "../firebase-admin/app";
import type {
  ServerSessionRecord,
  ServerSessionRotationCandidate,
  ServerSessionStore,
} from "./types";
import {
  parseServerSessionRecord,
  parseSessionId,
  parseTokenFingerprint,
} from "./validation";

export const serverSessionCollection = "serverSessions";
export const sessionTokenExchangeCollection = "sessionTokenExchanges";

export function createFirestoreServerSessionStore(
  firestore: Firestore,
): ServerSessionStore {
  const reference = (sessionId: string) =>
    firestore
      .collection(serverSessionCollection)
      .doc(parseSessionId(sessionId));

  return {
    async get(sessionId) {
      const snapshot = await reference(sessionId).get();
      if (!snapshot.exists) return null;
      const record = parseServerSessionRecord(snapshot.data());
      if (record.sessionId !== sessionId) {
        throw new Error("Server session document identity mismatch.");
      }
      return record;
    },
    async create(
      unvalidatedRecord: ServerSessionRecord,
      unvalidatedTokenFingerprint: string,
      rotation: ServerSessionRotationCandidate | null,
      revokedAtMilliseconds: number,
    ) {
      if (
        !Number.isInteger(revokedAtMilliseconds) ||
        revokedAtMilliseconds < 0
      ) {
        throw new Error("Invalid session rotation timestamp.");
      }
      const record = parseServerSessionRecord(unvalidatedRecord);
      const tokenFingerprint = parseTokenFingerprint(
        unvalidatedTokenFingerprint,
      );
      return firestore.runTransaction(async (transaction) => {
        const exchange = firestore
          .collection(sessionTokenExchangeCollection)
          .doc(tokenFingerprint);
        const exchangeSnapshot = await transaction.get(exchange);
        const rotationReference = rotation
          ? reference(rotation.sessionId)
          : null;
        const rotationSnapshot = rotationReference
          ? await transaction.get(rotationReference)
          : null;

        if (exchangeSnapshot.exists) return "replayed";
        if (rotation && rotationSnapshot) {
          if (!rotationSnapshot.exists) return "rotation_conflict";
          const current = parseServerSessionRecord(rotationSnapshot.data());
          if (
            current.sessionId !== rotation.sessionId ||
            current.uid !== rotation.uid ||
            current.credentialHash !== rotation.credentialHash ||
            current.revokedAtMilliseconds !== null
          ) {
            return "rotation_conflict";
          }
          revokedAtMilliseconds = Math.max(
            revokedAtMilliseconds,
            current.createdAtMilliseconds,
          );
        }

        transaction.create(reference(record.sessionId), record);
        transaction.create(exchange, {
          sessionId: record.sessionId,
          expiresAtMilliseconds: record.expiresAtMilliseconds,
        });
        if (rotationReference) {
          transaction.update(rotationReference, { revokedAtMilliseconds });
        }
        return "created";
      });
    },
    async revoke(sessionId, revokedAtMilliseconds) {
      if (
        !Number.isInteger(revokedAtMilliseconds) ||
        revokedAtMilliseconds < 0
      ) {
        throw new Error("Invalid session revocation timestamp.");
      }
      await firestore.runTransaction(async (transaction) => {
        const document = reference(sessionId);
        const snapshot = await transaction.get(document);
        if (!snapshot.exists) return;
        const record = parseServerSessionRecord(snapshot.data());
        if (record.sessionId !== sessionId) {
          throw new Error("Server session document identity mismatch.");
        }
        if (record.revokedAtMilliseconds !== null) return;
        transaction.update(document, {
          revokedAtMilliseconds: Math.max(
            revokedAtMilliseconds,
            record.createdAtMilliseconds,
          ),
        });
      });
    },
  };
}

let sessionStore: ServerSessionStore | undefined;

export function getFirestoreServerSessionStore(): ServerSessionStore {
  sessionStore ??= createFirestoreServerSessionStore(
    getFirestore(getFirebaseAdminApp()),
  );
  return sessionStore;
}
