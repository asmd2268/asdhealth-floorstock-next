import "server-only";

import { z } from "zod";

const placeholderPattern = /replace|placeholder|example|your[-_]/i;
const originPlaceholderPattern = /replace|placeholder|your[-_]/i;
const projectIdPattern = /^[a-z][a-z0-9-]{4,29}$/;
const serviceAccountEmailPattern =
  /^[a-z0-9-]+@[a-z][a-z0-9-]{4,29}\.iam\.gserviceaccount\.com$/;
const privateKeyPattern =
  /^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----\n?$/;

const serverEnvironmentSchema = z
  .object({
    FIREBASE_ADMIN_PROJECT_ID: z
      .string()
      .regex(projectIdPattern)
      .refine((value) => !placeholderPattern.test(value)),
    FIREBASE_ADMIN_CLIENT_EMAIL: z
      .string()
      .regex(serviceAccountEmailPattern)
      .refine((value) => !placeholderPattern.test(value)),
    FIREBASE_ADMIN_PRIVATE_KEY: z
      .string()
      .transform((value) => value.replace(/\\n/g, "\n"))
      .refine((value) => privateKeyPattern.test(value))
      .refine((value) => !placeholderPattern.test(value)),
    TRUSTED_PROVISIONING_ALLOWED_ORIGIN: z
      .url()
      .refine((value) => !originPlaceholderPattern.test(value))
      .refine((value) => {
        const url = new URL(value);
        return (
          url.origin === value &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(url.hostname)))
        );
      }),
  })
  .strict();

export interface FirebaseAdminEnvironment {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  allowedOrigin: string;
}

export function parseFirebaseAdminEnvironment(
  input: Record<string, string | undefined>,
): FirebaseAdminEnvironment {
  const parsed = serverEnvironmentSchema.parse({
    FIREBASE_ADMIN_PROJECT_ID: input.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: input.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: input.FIREBASE_ADMIN_PRIVATE_KEY,
    TRUSTED_PROVISIONING_ALLOWED_ORIGIN:
      input.TRUSTED_PROVISIONING_ALLOWED_ORIGIN,
  });

  return {
    projectId: parsed.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: parsed.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: parsed.FIREBASE_ADMIN_PRIVATE_KEY,
    allowedOrigin: parsed.TRUSTED_PROVISIONING_ALLOWED_ORIGIN,
  };
}

export function getFirebaseAdminEnvironment(): FirebaseAdminEnvironment {
  return parseFirebaseAdminEnvironment(process.env);
}
