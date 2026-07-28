import "server-only";

import {
  getFirestore,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";

import { resolveSession } from "@/domain/auth/session-resolver";
import { trustedSessionPaths } from "@/services/firebase/firestore-paths";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "@/services/firebase/trusted-session-records";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

import { getFirebaseAdminApp } from "../firebase-admin/app";
import type {
  ServerSessionRecord,
  ServerSessionRotationAuthorization,
  ServerSessionRotationCandidate,
  ServerSessionStore,
} from "./types";
import {
  fingerprintTrustedAuthorization,
  hasTrustedFacilityShellAccess,
  trustedAuthorizationFingerprintMatches,
} from "./trusted-authorization";
import {
  parseServerSessionRecord,
  parseSessionId,
  parseTokenFingerprint,
} from "./validation";

export const serverSessionCollection = "serverSessions";
export const sessionTokenExchangeCollection = "sessionTokenExchanges";

export function createFirestoreServerSessionStore(
  firestore: Firestore,
  now: () => number = Date.now,
): ServerSessionStore {
  const reference = (sessionId: string) =>
    firestore
      .collection(serverSessionCollection)
      .doc(parseSessionId(sessionId));

  const validateRotationAuthorization = async (
    transaction: Transaction,
    authorization: ServerSessionRotationAuthorization,
  ): Promise<boolean> => {
    const profileReference = firestore.doc(
      trustedSessionPaths.userProfile(authorization.identity.uid).join("/"),
    );
    const profileSnapshot = await transaction.get(profileReference);
    if (!profileSnapshot.exists) return false;
    const profile = parseTrustedUserProfile(profileSnapshot.data());
    if (
      profile.uid !== authorization.identity.uid ||
      profile.tenantId !== authorization.tenantId
    ) {
      return false;
    }

    const assignmentsQuery = firestore
      .collection(
        trustedSessionPaths
          .roleAssignments(authorization.identity.uid)
          .join("/"),
      )
      .where("uid", "==", authorization.identity.uid)
      .where("tenantId", "==", authorization.tenantId)
      .limit(trustedSessionLimits.roleAssignments + 1);
    const tenantReference = firestore.doc(
      trustedSessionPaths.tenantDirectory(authorization.tenantId).join("/"),
    );
    const assignmentsSnapshot = await transaction.get(assignmentsQuery);
    const tenantSnapshot = await transaction.get(tenantReference);
    if (
      assignmentsSnapshot.size > trustedSessionLimits.roleAssignments ||
      !tenantSnapshot.exists
    ) {
      return false;
    }

    const assignments = assignmentsSnapshot.docs.map((document) => {
      const assignment = parseTrustedRoleAssignment(document.data());
      if (
        assignment.uid !== authorization.identity.uid ||
        assignment.tenantId !== authorization.tenantId
      ) {
        throw new Error("Trusted role assignment boundary mismatch.");
      }
      return assignment;
    });
    const directory = parseTrustedTenantDirectory(tenantSnapshot.data());
    if (directory.tenantId !== authorization.tenantId) return false;

    const trusted = resolveSession({
      identity: authorization.identity,
      profile,
      roleAssignments: assignments,
      tenantDirectory: directory,
      requestedActiveFacilityId: authorization.activeFacilityId,
    });
    if (
      !trusted.ok ||
      !hasTrustedFacilityShellAccess(trusted, authorization.activeFacilityId)
    ) {
      return false;
    }
    return trustedAuthorizationFingerprintMatches(
      fingerprintTrustedAuthorization(trusted),
      authorization.trustedStateFingerprint,
    );
  };

  return {
    async get(sessionId) {
      const snapshot = await reference(sessionId).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data();
      if (
        typeof data === "object" &&
        data !== null &&
        "schemaVersion" in data &&
        data.schemaVersion === 1
      ) {
        return null;
      }
      const record = parseServerSessionRecord(data);
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
    async rotate(
      unvalidatedRecord: ServerSessionRecord,
      rotation: ServerSessionRotationCandidate,
      authorization: ServerSessionRotationAuthorization,
      revokedAtMilliseconds: number,
    ) {
      if (
        !Number.isInteger(revokedAtMilliseconds) ||
        revokedAtMilliseconds < 0
      ) {
        throw new Error("Invalid session rotation timestamp.");
      }
      const record = parseServerSessionRecord(unvalidatedRecord);
      return firestore.runTransaction(async (transaction) => {
        const rotationReference = reference(rotation.sessionId);
        const rotationSnapshot = await transaction.get(rotationReference);
        if (!rotationSnapshot.exists) return "rotation_conflict";
        const current = parseServerSessionRecord(rotationSnapshot.data());
        if (
          current.sessionId !== rotation.sessionId ||
          current.uid !== rotation.uid ||
          current.credentialHash !== rotation.credentialHash ||
          current.revokedAtMilliseconds !== null ||
          current.expiresAtMilliseconds <= revokedAtMilliseconds ||
          record.sessionId === current.sessionId ||
          record.uid !== current.uid ||
          record.firebaseAuthTimeSeconds !== current.firebaseAuthTimeSeconds ||
          record.expiresAtMilliseconds !== current.expiresAtMilliseconds ||
          record.createdAtMilliseconds !== revokedAtMilliseconds
        ) {
          return "rotation_conflict";
        }

        if (
          authorization.identity.uid !== current.uid ||
          authorization.tenantId.length === 0 ||
          authorization.activeFacilityId !== record.activeFacilityId ||
          !(await validateRotationAuthorization(transaction, authorization))
        ) {
          return "authorization_conflict";
        }

        if (current.expiresAtMilliseconds <= now()) {
          return "rotation_conflict";
        }

        transaction.create(reference(record.sessionId), record);
        transaction.update(rotationReference, { revokedAtMilliseconds });
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
