import { describe, expect, it, vi } from "vitest";

import {
  createFirebaseAuthenticationProvider,
  normalizeFirebaseAuthenticationError,
  type FirebaseAuthLike,
  type FirebaseAuthSdk,
  type FirebaseUserLike,
} from "./auth-adapter";

const user: FirebaseUserLike = {
  uid: "firebase-user-1",
  email: "user@example.com",
  displayName: "Example User",
};

function setup(currentUser: FirebaseUserLike | null = user) {
  const auth: FirebaseAuthLike = {
    currentUser,
    authStateReady: vi.fn().mockResolvedValue(undefined),
  };
  let stateListener: ((user: FirebaseUserLike | null) => void) | undefined;
  let errorListener: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const sdk: FirebaseAuthSdk = {
    getAuth: vi.fn(() => auth),
    onAuthStateChanged: vi.fn((_auth, listener, onError) => {
      stateListener = listener;
      errorListener = onError;
      return unsubscribe;
    }),
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user }),
    signOut: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue("fresh-id-token"),
  };

  return {
    auth,
    provider: createFirebaseAuthenticationProvider(sdk),
    sdk,
    emit: (nextUser: FirebaseUserLike | null) => stateListener?.(nextUser),
    emitError: () => errorListener?.(),
    unsubscribe,
  };
}

describe("Firebase authentication adapter", () => {
  it("normalizes the current Firebase identity", async () => {
    const { provider } = setup();
    await expect(provider.getIdentity()).resolves.toEqual({
      ok: true,
      identity: {
        uid: "firebase-user-1",
        email: "user@example.com",
        displayName: "Example User",
      },
    });
  });

  it("resolves a signed-out Firebase identity", async () => {
    const { provider } = setup(null);
    await expect(provider.getIdentity()).resolves.toEqual({
      ok: true,
      identity: null,
    });
  });

  it("normalizes auth-state events and returns the SDK unsubscribe", () => {
    const { emit, emitError, provider, unsubscribe } = setup();
    const listener = vi.fn();
    const onError = vi.fn();
    const stop = provider.subscribe(listener, onError);

    emit(user);
    emit(null);
    emitError();
    stop();

    expect(listener).toHaveBeenNthCalledWith(1, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    });
    expect(listener).toHaveBeenNthCalledWith(2, null);
    expect(onError).toHaveBeenCalledWith("provider_unavailable");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("signs in with email and password and normalizes the identity", async () => {
    const { provider, sdk } = setup();
    await expect(
      provider.signIn({ email: "user@example.com", password: "secret" }),
    ).resolves.toEqual({
      ok: true,
      identity: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
    });
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      "user@example.com",
      "secret",
    );
  });

  it.each([
    ["auth/user-not-found", "invalid_credentials"],
    ["auth/wrong-password", "invalid_credentials"],
    ["auth/invalid-credential", "invalid_credentials"],
    ["auth/user-disabled", "invalid_credentials"],
    ["auth/too-many-requests", "too_many_attempts"],
    ["auth/network-request-failed", "provider_unavailable"],
  ] as const)(
    "normalizes %s without exposing the raw error",
    async (code, reason) => {
      const { provider, sdk } = setup();
      vi.mocked(sdk.signInWithEmailAndPassword).mockRejectedValue({
        code,
        message: "raw Firebase details",
      });

      const result = await provider.signIn({
        email: "user@example.com",
        password: "secret",
      });
      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain("raw Firebase details");
    },
  );

  it("signs out and normalizes sign-out failures", async () => {
    const success = setup();
    await expect(success.provider.signOut()).resolves.toEqual({ ok: true });

    const failure = setup();
    vi.mocked(failure.sdk.signOut).mockRejectedValue(
      new Error("raw Firebase details"),
    );
    const result = await failure.provider.signOut();
    expect(result).toEqual({ ok: false, reason: "provider_unavailable" });
    expect(JSON.stringify(result)).not.toContain("raw Firebase details");
  });

  it("retrieves a force-refreshed ID token without adding authorization data", async () => {
    const { provider, sdk } = setup();
    await expect(provider.getIdentityToken()).resolves.toEqual({
      ok: true,
      token: "fresh-id-token",
    });
    expect(sdk.getIdToken).toHaveBeenCalledWith(user);
  });

  it("fails closed when Firebase initialization throws and initializes once", async () => {
    const broken = setup();
    vi.mocked(broken.sdk.getAuth).mockImplementation(() => {
      throw new Error("invalid environment");
    });
    await expect(broken.provider.getIdentity()).resolves.toEqual({
      ok: false,
      reason: "provider_unavailable",
    });
    const onError = vi.fn();
    expect(() => broken.provider.subscribe(vi.fn(), onError)).not.toThrow();
    expect(onError).toHaveBeenCalledWith("provider_unavailable");

    const valid = setup();
    await valid.provider.getIdentity();
    await valid.provider.signIn({ email: "user@example.com", password: "x" });
    await valid.provider.signOut();
    expect(valid.sdk.getAuth).toHaveBeenCalledOnce();
  });

  it("maps arbitrary errors to a safe provider failure", () => {
    expect(normalizeFirebaseAuthenticationError(new Error("secret"))).toBe(
      "provider_unavailable",
    );
  });
});
