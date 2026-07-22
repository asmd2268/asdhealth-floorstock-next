import { trustedSessionLimits } from "./trusted-session-limits";

const canonicalTrustedIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;

export function isCanonicalTrustedIdentifier(value: string): boolean {
  return (
    value.length <= trustedSessionLimits.identifierLength &&
    value !== "." &&
    value !== ".." &&
    canonicalTrustedIdentifier.test(value)
  );
}

export function requireCanonicalTrustedIdentifier(value: string): string {
  if (!isCanonicalTrustedIdentifier(value)) {
    throw new Error("Invalid trusted-session document identifier.");
  }
  return value;
}
