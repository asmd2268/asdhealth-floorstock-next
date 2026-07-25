import "server-only";

import { resolveScopedPermission } from "@/domain/access/permissions";

import {
  createServerSessionCredential,
  fingerprintFirebaseIdToken,
  hashSessionSecret,
  parseSessionCredential,
  serializeSessionCredential,
  sessionSecretMatches,
} from "./crypto";
import type {
  FirebaseServerIdentityVerifier,
  ResolvedServerSession,
  ServerSessionRecord,
  ServerSessionResult,
  ServerSessionRotationCandidate,
  ServerSessionService,
  ServerSessionStore,
  ServerTrustedSessionResolver,
} from "./types";
import { SERVER_SESSION_LIFETIME_SECONDS } from "./types";

const MAX_ID_TOKEN_AGE_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 60;

export interface ServerSessionServiceDependencies {
  identityVerifier: FirebaseServerIdentityVerifier;
  trustedSessions: ServerTrustedSessionResolver;
  store: ServerSessionStore;
  now?: () => number;
}

const failed = <T>(
  code: "unauthenticated" | "forbidden" | "provider_unavailable",
): ServerSessionResult<T> => ({ ok: false, code });

export function createServerSessionService(
  dependencies: ServerSessionServiceDependencies,
): ServerSessionService {
  const now = dependencies.now ?? Date.now;

  const resolveStoredCredential = async (
    cookieValue: string | undefined,
  ): Promise<ServerSessionResult<ServerSessionRecord>> => {
    const credential = parseSessionCredential(cookieValue);
    if (!credential) return failed("unauthenticated");

    try {
      const record = await dependencies.store.get(credential.sessionId);
      const currentTime = now();
      if (
        !record ||
        record.sessionId !== credential.sessionId ||
        record.revokedAtMilliseconds !== null ||
        record.createdAtMilliseconds >
          currentTime + CLOCK_SKEW_SECONDS * 1000 ||
        record.expiresAtMilliseconds <= currentTime ||
        !sessionSecretMatches(credential.secret, record.credentialHash)
      ) {
        return failed("unauthenticated");
      }

      return { ok: true, value: record };
    } catch {
      return failed("provider_unavailable");
    }
  };

  const resolve = async (
    cookieValue: string | undefined,
  ): Promise<ServerSessionResult<ResolvedServerSession>> => {
    const stored = await resolveStoredCredential(cookieValue);
    if (!stored.ok) return stored;

    try {
      const record = stored.value;
      const currentIdentity =
        await dependencies.identityVerifier.resolveCurrentIdentity(
          record.uid,
          record.firebaseAuthTimeSeconds,
        );
      if (!currentIdentity.ok) return failed(currentIdentity.code);
      if (currentIdentity.identity.uid !== record.uid)
        return failed("forbidden");

      const trusted = await dependencies.trustedSessions.resolveIdentity(
        currentIdentity.identity,
      );
      if (!trusted.ok) {
        return failed(
          trusted.failure.category === "provider_error"
            ? "provider_unavailable"
            : "forbidden",
        );
      }
      return { ok: true, value: { record, trusted } };
    } catch {
      return failed("provider_unavailable");
    }
  };

  return {
    async create(idToken, previousCookieValue) {
      try {
        const verified =
          await dependencies.identityVerifier.verifyIdToken(idToken);
        if (!verified.ok) return failed(verified.code);

        const nowMilliseconds = now();
        const nowSeconds = Math.floor(nowMilliseconds / 1000);
        if (
          verified.identity.issuedAtSeconds > nowSeconds + CLOCK_SKEW_SECONDS ||
          verified.identity.authTimeSeconds >
            verified.identity.issuedAtSeconds + CLOCK_SKEW_SECONDS ||
          nowSeconds - verified.identity.issuedAtSeconds >
            MAX_ID_TOKEN_AGE_SECONDS
        ) {
          return failed("unauthenticated");
        }

        const trusted = await dependencies.trustedSessions.resolveIdentity(
          verified.identity.identity,
        );
        if (!trusted.ok) {
          return failed(
            trusted.failure.category === "provider_error"
              ? "provider_unavailable"
              : "forbidden",
          );
        }
        const shellAccess = resolveScopedPermission({
          roleAssignments: trusted.user.roleAssignments,
          resource: "dashboard",
          action: "read",
          subjectScope: trusted.user.activeScope,
          targetScope: trusted.user.activeScope,
          featureFlags: trusted.featureFlags,
          overrides: trusted.user.explicitPermissionOverrides,
        });
        if (!shellAccess.allowed) return failed("forbidden");

        const credential = createServerSessionCredential();
        const expiresAtMilliseconds =
          nowMilliseconds + SERVER_SESSION_LIFETIME_SECONDS * 1000;
        let rotation: ServerSessionRotationCandidate | null = null;
        const previousCredential = parseSessionCredential(previousCookieValue);
        if (previousCredential) {
          const previousRecord = await dependencies.store.get(
            previousCredential.sessionId,
          );
          if (
            previousRecord &&
            previousRecord.uid === verified.identity.identity.uid &&
            sessionSecretMatches(
              previousCredential.secret,
              previousRecord.credentialHash,
            )
          ) {
            rotation = {
              sessionId: previousRecord.sessionId,
              uid: previousRecord.uid,
              credentialHash: previousRecord.credentialHash,
            };
          }
        }
        const stored = await dependencies.store.create(
          {
            schemaVersion: 1,
            sessionId: credential.sessionId,
            uid: verified.identity.identity.uid,
            credentialHash: hashSessionSecret(credential.secret),
            firebaseAuthTimeSeconds: verified.identity.authTimeSeconds,
            createdAtMilliseconds: nowMilliseconds,
            expiresAtMilliseconds,
            revokedAtMilliseconds: null,
          },
          fingerprintFirebaseIdToken(idToken),
          rotation,
          nowMilliseconds,
        );
        if (stored !== "created") {
          return failed("unauthenticated");
        }

        return {
          ok: true,
          value: {
            cookieValue: serializeSessionCredential(credential),
            expiresAtMilliseconds,
          },
        };
      } catch {
        return failed("provider_unavailable");
      }
    },

    resolve,

    async authorize(cookieValue, permission) {
      const session = await resolve(cookieValue);
      if (!session.ok) return session;
      const { user, featureFlags } = session.value.trusted;
      const targetScope = permission.targetScope ?? user.activeScope;
      const decision = resolveScopedPermission({
        roleAssignments: user.roleAssignments,
        resource: permission.resource,
        action: permission.action,
        subjectScope: user.activeScope,
        targetScope,
        featureFlags,
        overrides: user.explicitPermissionOverrides,
      });
      return decision.allowed ? session : failed("forbidden");
    },

    async revoke(cookieValue) {
      const stored = await resolveStoredCredential(cookieValue);
      if (!stored.ok) return stored;
      try {
        await dependencies.store.revoke(stored.value.sessionId, now());
        return { ok: true, value: null };
      } catch {
        return failed("provider_unavailable");
      }
    },
  };
}
