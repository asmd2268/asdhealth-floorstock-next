import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ServerSessionCredential } from "./types";
import { serverSessionLimits } from "./validation";

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function domainSeparatedDigest(domain: string, value: string): string {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function createServerSessionCredential(): ServerSessionCredential {
  return { sessionId: randomToken(), secret: randomToken() };
}

export function hashSessionSecret(secret: string): string {
  return domainSeparatedDigest("asdhealth:session-secret:v1", secret);
}

export function fingerprintFirebaseIdToken(idToken: string): string {
  return domainSeparatedDigest("asdhealth:firebase-id-token:v1", idToken);
}

export function serializeSessionCredential(
  credential: ServerSessionCredential,
): string {
  return `${credential.sessionId}.${credential.secret}`;
}

export function parseSessionCredential(
  value: string | undefined,
): ServerSessionCredential | null {
  if (!value || value.length !== serverSessionLimits.sessionIdLength * 2 + 1) {
    return null;
  }
  const [sessionId, secret, extra] = value.split(".");
  const valid = /^[A-Za-z0-9_-]+$/;
  if (
    extra !== undefined ||
    sessionId.length !== serverSessionLimits.sessionIdLength ||
    secret.length !== serverSessionLimits.secretLength ||
    !valid.test(sessionId) ||
    !valid.test(secret)
  ) {
    return null;
  }
  return { sessionId, secret };
}

export function sessionSecretMatches(
  secret: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashSessionSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
