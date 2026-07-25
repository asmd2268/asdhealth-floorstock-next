import "server-only";

import { z } from "zod";

import { isCanonicalTrustedIdentifier } from "@/services/firebase/trusted-identifier";

import type { ServerSessionRecord } from "./types";
import { SERVER_SESSION_LIFETIME_SECONDS } from "./types";

export const serverSessionLimits = {
  idTokenBytes: 8_192,
  requestBodyBytes: 12_288,
  sessionIdLength: 43,
  secretLength: 43,
  hashLength: 64,
} as const;

const base64Url = /^[A-Za-z0-9_-]+$/;
const fixedToken = (length: number) =>
  z.string().length(length).regex(base64Url);
const sha256Digest = z
  .string()
  .length(serverSessionLimits.hashLength)
  .regex(/^[a-f0-9]+$/);

export const createSessionBodySchema = z
  .object({
    idToken: z
      .string()
      .min(1)
      .max(serverSessionLimits.idTokenBytes)
      .refine(
        (value) =>
          new TextEncoder().encode(value).byteLength <=
          serverSessionLimits.idTokenBytes,
      ),
  })
  .strict();

export const sessionRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: fixedToken(serverSessionLimits.sessionIdLength),
    uid: z.string().min(1).max(128).refine(isCanonicalTrustedIdentifier),
    credentialHash: sha256Digest,
    firebaseAuthTimeSeconds: z.number().int().nonnegative(),
    createdAtMilliseconds: z.number().int().nonnegative(),
    expiresAtMilliseconds: z.number().int().positive(),
    revokedAtMilliseconds: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.expiresAtMilliseconds <= record.createdAtMilliseconds) {
      context.addIssue({
        code: "custom",
        message: "Session expiry must follow creation.",
        path: ["expiresAtMilliseconds"],
      });
    }
    if (
      record.expiresAtMilliseconds - record.createdAtMilliseconds >
      SERVER_SESSION_LIFETIME_SECONDS * 1000
    ) {
      context.addIssue({
        code: "custom",
        message: "Session lifetime exceeds the configured maximum.",
        path: ["expiresAtMilliseconds"],
      });
    }
    if (
      record.firebaseAuthTimeSeconds * 1000 >
      record.createdAtMilliseconds + 60_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Firebase authentication time cannot be in the future.",
        path: ["firebaseAuthTimeSeconds"],
      });
    }
    if (
      record.revokedAtMilliseconds !== null &&
      record.revokedAtMilliseconds < record.createdAtMilliseconds
    ) {
      context.addIssue({
        code: "custom",
        message: "Session revocation cannot predate creation.",
        path: ["revokedAtMilliseconds"],
      });
    }
  });

export function parseServerSessionRecord(input: unknown): ServerSessionRecord {
  return sessionRecordSchema.parse(input);
}

export function parseTokenFingerprint(input: unknown): string {
  return sha256Digest.parse(input);
}

export function parseSessionId(input: unknown): string {
  return fixedToken(serverSessionLimits.sessionIdLength).parse(input);
}
