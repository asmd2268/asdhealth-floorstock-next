import "server-only";

import { getAuth, type Auth } from "firebase-admin/auth";

import type { FirebaseServerIdentityVerifier } from "./types";
import { getFirebaseAdminApp } from "../firebase-admin/app";

function isRejectedIdentity(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return [
    "auth/argument-error",
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/invalid-id-token",
    "auth/user-not-found",
  ].includes(String(error.code));
}

export function createFirebaseServerIdentityVerifier(
  auth: Pick<Auth, "verifyIdToken" | "getUser">,
): FirebaseServerIdentityVerifier {
  return {
    async verifyIdToken(token) {
      try {
        const decoded = await auth.verifyIdToken(token, true);
        if (
          !decoded.uid ||
          !Number.isInteger(decoded.auth_time) ||
          decoded.auth_time < 0 ||
          !Number.isInteger(decoded.iat) ||
          decoded.iat < 0
        ) {
          return { ok: false, code: "unauthenticated" };
        }
        const user = await auth.getUser(decoded.uid);
        if (user.disabled || user.uid !== decoded.uid) {
          return { ok: false, code: "unauthenticated" };
        }
        return {
          ok: true,
          identity: {
            identity: {
              uid: user.uid,
              email: user.email ?? null,
              displayName: user.displayName ?? null,
            },
            authTimeSeconds: decoded.auth_time,
            issuedAtSeconds: decoded.iat,
          },
        };
      } catch (error) {
        return {
          ok: false,
          code: isRejectedIdentity(error)
            ? "unauthenticated"
            : "provider_unavailable",
        };
      }
    },

    async resolveCurrentIdentity(uid, authTimeSeconds) {
      try {
        const user = await auth.getUser(uid);
        if (user.disabled) return { ok: false, code: "forbidden" };
        if (user.uid !== uid) return { ok: false, code: "forbidden" };
        const validAfterMilliseconds = Date.parse(
          user.tokensValidAfterTime ?? "",
        );
        if (
          !Number.isFinite(validAfterMilliseconds) ||
          validAfterMilliseconds / 1000 > authTimeSeconds
        ) {
          return { ok: false, code: "unauthenticated" };
        }
        return {
          ok: true,
          identity: {
            uid: user.uid,
            email: user.email ?? null,
            displayName: user.displayName ?? null,
          },
        };
      } catch (error) {
        return {
          ok: false,
          code: isRejectedIdentity(error)
            ? "unauthenticated"
            : "provider_unavailable",
        };
      }
    },
  };
}

let identityVerifier: FirebaseServerIdentityVerifier | undefined;

export function getFirebaseServerIdentityVerifier(): FirebaseServerIdentityVerifier {
  identityVerifier ??= createFirebaseServerIdentityVerifier(
    getAuth(getFirebaseAdminApp()),
  );
  return identityVerifier;
}
