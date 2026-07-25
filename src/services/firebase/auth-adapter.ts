import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";

import type { ProviderIdentity } from "@/domain/auth/types";
import type {
  AuthenticationProvider,
  AuthenticationProviderFailureReason,
} from "@/services/contracts/auth";
import type { IdentityTokenProvider } from "@/services/contracts/server-session";

import { getBrowserFirebaseApp } from "./browser";

export interface FirebaseUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface FirebaseAuthLike {
  currentUser: FirebaseUserLike | null;
  authStateReady(): Promise<void>;
}

export interface FirebaseAuthSdk {
  getAuth(): FirebaseAuthLike;
  onAuthStateChanged(
    auth: FirebaseAuthLike,
    listener: (user: FirebaseUserLike | null) => void,
    onError: () => void,
  ): () => void;
  signInWithEmailAndPassword(
    auth: FirebaseAuthLike,
    email: string,
    password: string,
  ): Promise<{ user: FirebaseUserLike }>;
  signOut(auth: FirebaseAuthLike): Promise<void>;
  getIdToken(user: FirebaseUserLike): Promise<string>;
}

const firebaseSdk: FirebaseAuthSdk = {
  getAuth: () => getAuth(getBrowserFirebaseApp()),
  onAuthStateChanged: (auth, listener, onError) =>
    onAuthStateChanged(
      auth as Auth,
      listener as (user: User | null) => void,
      onError,
    ),
  signInWithEmailAndPassword: (auth, email, password) =>
    signInWithEmailAndPassword(auth as Auth, email, password),
  signOut: (auth) => firebaseSignOut(auth as Auth),
  getIdToken: (user) => (user as User).getIdToken(true),
};

const credentialErrorCodes = new Set([
  "auth/invalid-credential",
  "auth/invalid-email",
  "auth/invalid-login-credentials",
  "auth/missing-password",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/wrong-password",
]);

function firebaseErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

export function normalizeFirebaseAuthenticationError(
  error: unknown,
): AuthenticationProviderFailureReason {
  const code = firebaseErrorCode(error);
  if (code && credentialErrorCodes.has(code)) return "invalid_credentials";
  if (code === "auth/too-many-requests") return "too_many_attempts";
  return "provider_unavailable";
}

export function normalizeFirebaseIdentity(
  user: FirebaseUserLike,
): ProviderIdentity {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  };
}

export function createFirebaseAuthenticationProvider(
  sdk: FirebaseAuthSdk = firebaseSdk,
): AuthenticationProvider & IdentityTokenProvider {
  let auth: FirebaseAuthLike | undefined;
  const resolveAuth = () => {
    auth ??= sdk.getAuth();
    return auth;
  };

  return {
    async getIdentity() {
      try {
        const resolvedAuth = resolveAuth();
        await resolvedAuth.authStateReady();
        return {
          ok: true,
          identity: resolvedAuth.currentUser
            ? normalizeFirebaseIdentity(resolvedAuth.currentUser)
            : null,
        };
      } catch {
        return { ok: false, reason: "provider_unavailable" };
      }
    },

    subscribe(listener, onError) {
      try {
        return sdk.onAuthStateChanged(
          resolveAuth(),
          (user) => listener(user ? normalizeFirebaseIdentity(user) : null),
          () => onError?.("provider_unavailable"),
        );
      } catch {
        onError?.("provider_unavailable");
        return () => undefined;
      }
    },

    async signIn(request) {
      try {
        const credential = await sdk.signInWithEmailAndPassword(
          resolveAuth(),
          request.email,
          request.password,
        );
        return {
          ok: true,
          identity: normalizeFirebaseIdentity(credential.user),
        };
      } catch (error) {
        return {
          ok: false,
          reason: normalizeFirebaseAuthenticationError(error),
        };
      }
    },

    async signOut() {
      try {
        await sdk.signOut(resolveAuth());
        return { ok: true };
      } catch {
        return { ok: false, reason: "provider_unavailable" };
      }
    },

    async getIdentityToken() {
      try {
        const resolvedAuth = resolveAuth();
        await resolvedAuth.authStateReady();
        if (!resolvedAuth.currentUser) {
          return { ok: false, reason: "provider_unavailable" };
        }
        const token = await sdk.getIdToken(resolvedAuth.currentUser);
        return token
          ? { ok: true, token }
          : { ok: false, reason: "provider_unavailable" };
      } catch {
        return { ok: false, reason: "provider_unavailable" };
      }
    },
  };
}

let firebaseAuthenticationProvider:
  (AuthenticationProvider & IdentityTokenProvider) | undefined;

export function getFirebaseAuthenticationProvider(): AuthenticationProvider &
  IdentityTokenProvider {
  firebaseAuthenticationProvider ??= createFirebaseAuthenticationProvider();
  return firebaseAuthenticationProvider;
}
