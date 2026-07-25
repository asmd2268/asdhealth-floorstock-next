import "server-only";

import { parseSessionCredential } from "./crypto";

export const MAX_COOKIE_HEADER_BYTES = 8_192;

export type SessionCookieReadResult =
  { ok: true; value: string | undefined } | { ok: false };

export function readUniqueSessionCookie(
  cookieHeader: string | null,
  cookieName: string,
): SessionCookieReadResult {
  if (cookieHeader === null || cookieHeader.length === 0) {
    return { ok: true, value: undefined };
  }
  if (
    new TextEncoder().encode(cookieHeader).byteLength > MAX_COOKIE_HEADER_BYTES
  ) {
    return { ok: false };
  }

  const matchingValues: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const cookie = part.trim();
    const separator = cookie.indexOf("=");
    if (separator < 0) {
      if (cookie === cookieName) return { ok: false };
      continue;
    }
    const rawName = cookie.slice(0, separator);
    if (rawName.trim() === cookieName && rawName !== cookieName) {
      return { ok: false };
    }
    if (rawName === cookieName) {
      matchingValues.push(cookie.slice(separator + 1));
    }
  }

  if (matchingValues.length === 0) return { ok: true, value: undefined };
  if (matchingValues.length !== 1) return { ok: false };
  return parseSessionCredential(matchingValues[0])
    ? { ok: true, value: matchingValues[0] }
    : { ok: false };
}
