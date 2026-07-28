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
import {
  fingerprintTrustedAuthorization,
  hasTrustedFacilityShellAccess,
} from "./trusted-authorization";
import { parseActiveFacilityId } from "./validation";

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
        record.activeFacilityId,
      );
      if (!trusted.ok) {
        return failed(
          trusted.failure.category === "provider_error"
            ? "provider_unavailable"
            : "forbidden",
        );
      }
      if (!hasActiveFacilityContext(trusted, record.activeFacilityId)) {
        return failed("forbidden");
      }
      return { ok: true, value: { record, trusted } };
    } catch {
      return failed("provider_unavailable");
    }
  };

  const hasActiveFacilityContext = (
    trusted: Extract<
      Awaited<ReturnType<ServerTrustedSessionResolver["resolveIdentity"]>>,
      { ok: true }
    >,
    expectedFacilityId = trusted.user.activeFacilityId,
  ): boolean =>
    trusted.user.activeFacilityId === expectedFacilityId &&
    trusted.user.activeScope.kind === "facility" &&
    trusted.user.activeScope.facilityId === expectedFacilityId;

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

        let rotation: ServerSessionRotationCandidate | null = null;
        let preservedActiveFacilityId: string | undefined;
        const previousCredential = parseSessionCredential(previousCookieValue);
        if (previousCredential) {
          const previous = await resolveStoredCredential(previousCookieValue);
          if (!previous.ok && previous.code === "provider_unavailable") {
            return failed("provider_unavailable");
          }
          if (
            previous.ok &&
            previous.value.uid === verified.identity.identity.uid
          ) {
            rotation = {
              sessionId: previous.value.sessionId,
              uid: previous.value.uid,
              credentialHash: previous.value.credentialHash,
            };
            preservedActiveFacilityId = previous.value.activeFacilityId;
          }
        }

        const trusted = await dependencies.trustedSessions.resolveIdentity(
          verified.identity.identity,
          preservedActiveFacilityId,
        );
        if (!trusted.ok) {
          return failed(
            trusted.failure.category === "provider_error"
              ? "provider_unavailable"
              : "forbidden",
          );
        }
        if (
          !hasActiveFacilityContext(trusted) ||
          (preservedActiveFacilityId !== undefined &&
            trusted.user.activeFacilityId !== preservedActiveFacilityId)
        ) {
          return failed("forbidden");
        }
        if (!hasTrustedFacilityShellAccess(trusted)) return failed("forbidden");

        const credential = createServerSessionCredential();
        const expiresAtMilliseconds =
          nowMilliseconds + SERVER_SESSION_LIFETIME_SECONDS * 1000;
        const stored = await dependencies.store.create(
          {
            schemaVersion: 2,
            sessionId: credential.sessionId,
            uid: verified.identity.identity.uid,
            activeFacilityId: trusted.user.activeFacilityId,
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

    async switchFacility(cookieValue, requestedFacilityId) {
      let facilityId: string;
      try {
        facilityId = parseActiveFacilityId(requestedFacilityId);
      } catch {
        return { ok: false, code: "invalid_request" };
      }

      const stored = await resolveStoredCredential(cookieValue);
      if (!stored.ok) return stored;
      try {
        const previous = stored.value;
        const currentIdentity =
          await dependencies.identityVerifier.resolveCurrentIdentity(
            previous.uid,
            previous.firebaseAuthTimeSeconds,
          );
        if (!currentIdentity.ok) return failed(currentIdentity.code);
        if (currentIdentity.identity.uid !== previous.uid) {
          return failed("forbidden");
        }

        const trusted = await dependencies.trustedSessions.resolveIdentity(
          currentIdentity.identity,
          facilityId,
        );
        if (!trusted.ok) {
          return failed(
            trusted.failure.category === "provider_error"
              ? "provider_unavailable"
              : "forbidden",
          );
        }
        if (!hasActiveFacilityContext(trusted, facilityId)) {
          return failed("forbidden");
        }
        if (!hasTrustedFacilityShellAccess(trusted, facilityId)) {
          return failed("forbidden");
        }

        const credential = createServerSessionCredential();
        const rotatedAtMilliseconds = now();
        if (previous.expiresAtMilliseconds <= rotatedAtMilliseconds) {
          return failed("unauthenticated");
        }
        const rotated = await dependencies.store.rotate(
          {
            schemaVersion: 2,
            sessionId: credential.sessionId,
            uid: previous.uid,
            activeFacilityId: trusted.user.activeFacilityId,
            credentialHash: hashSessionSecret(credential.secret),
            firebaseAuthTimeSeconds: previous.firebaseAuthTimeSeconds,
            createdAtMilliseconds: rotatedAtMilliseconds,
            expiresAtMilliseconds: previous.expiresAtMilliseconds,
            revokedAtMilliseconds: null,
          },
          {
            sessionId: previous.sessionId,
            uid: previous.uid,
            credentialHash: previous.credentialHash,
          },
          {
            identity: currentIdentity.identity,
            tenantId: trusted.user.tenantId,
            activeFacilityId: trusted.user.activeFacilityId,
            trustedStateFingerprint: fingerprintTrustedAuthorization(trusted),
          },
          rotatedAtMilliseconds,
        );
        if (rotated === "authorization_conflict") return failed("forbidden");
        if (rotated !== "created") return failed("unauthenticated");

        return {
          ok: true,
          value: {
            activeFacilityId: trusted.user.activeFacilityId,
            cookieValue: serializeSessionCredential(credential),
            expiresAtMilliseconds: previous.expiresAtMilliseconds,
          },
        };
      } catch {
        return failed("provider_unavailable");
      }
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
