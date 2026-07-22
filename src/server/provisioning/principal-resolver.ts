import "server-only";

import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import type { AdministratorPrincipal } from "@/domain/provisioning/types";
import { administratorPrincipalSchema } from "@/domain/provisioning/schemas";

import { getFirebaseAdminApp } from "../firebase-admin/app";

export type PrincipalResolutionResult =
  | { ok: true; principal: AdministratorPrincipal }
  | {
      ok: false;
      code: "unauthenticated" | "forbidden" | "provider_unavailable";
    };

export interface TrustedAdministratorPrincipalResolver {
  resolve(
    authorizationHeader: string | null,
  ): Promise<PrincipalResolutionResult>;
}

function bearerToken(header: string | null): string | null {
  if (!header || header.length > 8_192) return null;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header);
  return match?.[1] ?? null;
}

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

export function createTrustedAdministratorPrincipalResolver(
  auth: Pick<Auth, "verifyIdToken" | "getUser">,
  firestore: Firestore,
): TrustedAdministratorPrincipalResolver {
  return {
    async resolve(authorizationHeader) {
      const token = bearerToken(authorizationHeader);
      if (!token) return { ok: false, code: "unauthenticated" };

      try {
        const identity = await auth.verifyIdToken(token, true);
        const user = await auth.getUser(identity.uid);
        if (user.disabled) return { ok: false, code: "forbidden" };

        const snapshot = await firestore
          .doc("provisioningAdministrators/" + identity.uid)
          .get();
        if (!snapshot.exists) return { ok: false, code: "forbidden" };
        const parsed = administratorPrincipalSchema.safeParse(snapshot.data());
        if (!parsed.success || parsed.data.uid !== identity.uid) {
          return { ok: false, code: "forbidden" };
        }
        return { ok: true, principal: parsed.data };
      } catch (error) {
        if (isRejectedIdentity(error)) {
          return { ok: false, code: "unauthenticated" };
        }
        return { ok: false, code: "provider_unavailable" };
      }
    },
  };
}

let principalResolver: TrustedAdministratorPrincipalResolver | undefined;

export function getTrustedAdministratorPrincipalResolver(): TrustedAdministratorPrincipalResolver {
  if (!principalResolver) {
    const app = getFirebaseAdminApp();
    principalResolver = createTrustedAdministratorPrincipalResolver(
      getAuth(app),
      getFirestore(app),
    );
  }
  return principalResolver;
}
