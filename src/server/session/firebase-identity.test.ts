import { describe, expect, it, vi } from "vitest";

import { createFirebaseServerIdentityVerifier } from "./firebase-identity";

const decoded = {
  uid: "user-1",
  auth_time: 1_800_000_000,
  iat: 1_800_000_010,
};
const user = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "User",
  disabled: false,
  tokensValidAfterTime: new Date(1_799_999_000_000).toISOString(),
};

function auth() {
  return {
    verifyIdToken: vi.fn().mockResolvedValue(decoded),
    getUser: vi.fn().mockResolvedValue(user),
  };
}

describe("Firebase server identity verifier", () => {
  it("verifies revocation and normalizes identity-only fields", async () => {
    const sdk = auth();
    const verifier = createFirebaseServerIdentityVerifier(sdk as never);
    await expect(verifier.verifyIdToken("id-token")).resolves.toEqual({
      ok: true,
      identity: {
        identity: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        },
        authTimeSeconds: decoded.auth_time,
        issuedAtSeconds: decoded.iat,
      },
    });
    expect(sdk.verifyIdToken).toHaveBeenCalledWith("id-token", true);
  });

  it.each([
    "auth/invalid-id-token",
    "auth/id-token-expired",
    "auth/id-token-revoked",
  ])("normalizes %s without exposing provider details", async (code) => {
    const sdk = auth();
    sdk.verifyIdToken.mockRejectedValue({ code, message: "raw token detail" });
    await expect(
      createFirebaseServerIdentityVerifier(sdk as never).verifyIdToken("bad"),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });

  it("rejects disabled users and identities revoked after authentication", async () => {
    const disabled = auth();
    disabled.getUser.mockResolvedValue({ ...user, disabled: true });
    await expect(
      createFirebaseServerIdentityVerifier(disabled as never).verifyIdToken(
        "token",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });

    const revoked = auth();
    revoked.getUser.mockResolvedValue({
      ...user,
      tokensValidAfterTime: new Date(
        (decoded.auth_time + 1) * 1000,
      ).toISOString(),
    });
    await expect(
      createFirebaseServerIdentityVerifier(
        revoked as never,
      ).resolveCurrentIdentity(user.uid, decoded.auth_time),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });

  it("never reads Firebase custom claims for authorization", async () => {
    const sdk = auth();
    sdk.verifyIdToken.mockResolvedValue({
      ...decoded,
      role: "master",
      tenantId: "attacker-tenant",
    });
    const result = await createFirebaseServerIdentityVerifier(
      sdk as never,
    ).verifyIdToken("token");
    expect(JSON.stringify(result)).not.toContain("master");
    expect(JSON.stringify(result)).not.toContain("attacker-tenant");
  });

  it("rejects an Admin adapter identity mismatch and malformed token times", async () => {
    const mismatched = auth();
    mismatched.getUser.mockResolvedValue({ ...user, uid: "user-2" });
    await expect(
      createFirebaseServerIdentityVerifier(mismatched as never).verifyIdToken(
        "token",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });

    const malformed = auth();
    malformed.verifyIdToken.mockResolvedValue({
      ...decoded,
      auth_time: -1,
    });
    await expect(
      createFirebaseServerIdentityVerifier(malformed as never).verifyIdToken(
        "token",
      ),
    ).resolves.toEqual({ ok: false, code: "unauthenticated" });
  });
});
