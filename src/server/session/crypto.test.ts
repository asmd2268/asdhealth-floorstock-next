import { describe, expect, it } from "vitest";

import {
  fingerprintFirebaseIdToken,
  hashSessionSecret,
  sessionSecretMatches,
} from "./crypto";

describe("server session digests", () => {
  it("domain-separates session secrets from Firebase token fingerprints", () => {
    const value = "same-input-value";
    const secretDigest = hashSessionSecret(value);
    const tokenFingerprint = fingerprintFirebaseIdToken(value);
    expect(secretDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(secretDigest).not.toBe(tokenFingerprint);
    expect(sessionSecretMatches(value, secretDigest)).toBe(true);
    expect(sessionSecretMatches(value, tokenFingerprint)).toBe(false);
  });
});
