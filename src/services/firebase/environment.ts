import { z } from "zod";

const placeholderFreeString = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("replace-with-"), {
    message: "Placeholder values are not valid Firebase configuration.",
  });

const hostnameSchema = placeholderFreeString.refine((value) => {
  if (value.includes("://") || value.includes("/") || value.length > 253) {
    return false;
  }

  return value
    .split(".")
    .every((label) =>
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
    );
}, "Expected a valid hostname without a protocol or path.");

const firebaseEnvironmentSchema = z
  .object({
    apiKey: placeholderFreeString.min(20),
    authDomain: hostnameSchema,
    projectId: placeholderFreeString.regex(
      /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
      "Expected a valid Firebase project ID.",
    ),
    storageBucket: hostnameSchema,
    messagingSenderId: placeholderFreeString.regex(/^\d+$/),
    appId: placeholderFreeString.regex(
      /^\d+:\d+:web:[A-Za-z0-9]+$/,
      "Expected a valid Firebase web app ID.",
    ),
  })
  .strict();

export type FirebaseEnvironment = z.infer<typeof firebaseEnvironmentSchema>;

export function parseFirebaseEnvironment(input: unknown): FirebaseEnvironment {
  return firebaseEnvironmentSchema.parse(input);
}

export function readFirebaseEnvironment(): FirebaseEnvironment {
  return parseFirebaseEnvironment({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}
