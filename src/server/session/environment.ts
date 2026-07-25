import "server-only";

import { z } from "zod";

const placeholderPattern = /replace|placeholder|your[-_]/i;

const environmentSchema = z
  .object({
    SERVER_SESSION_ALLOWED_ORIGIN: z
      .url()
      .refine((value) => !placeholderPattern.test(value))
      .refine((value) => {
        const url = new URL(value);
        return (
          value === url.origin &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(url.hostname)))
        );
      }),
  })
  .strict();

export interface ServerSessionEnvironment {
  allowedOrigin: string;
}

export function parseServerSessionEnvironment(
  input: Record<string, string | undefined>,
): ServerSessionEnvironment {
  const parsed = environmentSchema.parse({
    SERVER_SESSION_ALLOWED_ORIGIN: input.SERVER_SESSION_ALLOWED_ORIGIN,
  });
  return { allowedOrigin: parsed.SERVER_SESSION_ALLOWED_ORIGIN };
}

export function getServerSessionEnvironment(): ServerSessionEnvironment {
  return parseServerSessionEnvironment(process.env);
}
