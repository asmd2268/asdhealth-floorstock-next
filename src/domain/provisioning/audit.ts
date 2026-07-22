import type {
  ProvisioningAuditEvent,
  ProvisioningRequestContext,
} from "./types";

const forbiddenMetadataKey =
  /secret|token|password|credential|private.?key|authorization|cookie/i;
const forbiddenMetadataValue =
  /authorization\s*:\s*bearer|(?:^|\s)bearer\s+[a-z0-9._~+/-]{8,}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|(?:cookie|session(?:id|token)?|access[_ -]?token|refresh[_ -]?token|password|credentials?)\s*(?::|=|\b(?:is|are|was)\b)\s*\S+/i;
const maxMetadataEntries = 20;
const maxMetadataKeyLength = 64;
const maxMetadataStringLength = 128;
const maxMetadataInspectionLength = 4_096;

export function sanitizeAuditMetadata(
  input: Readonly<Record<string, unknown>>,
): ProvisioningAuditEvent["metadata"] {
  const output: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(input).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    if (Object.keys(output).length >= maxMetadataEntries) break;
    if (key.length > maxMetadataKeyLength || forbiddenMetadataKey.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      if (
        forbiddenMetadataValue.test(value.slice(0, maxMetadataInspectionLength))
      ) {
        continue;
      }
      output[key] = value.slice(0, maxMetadataStringLength);
    } else if (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = value;
    }
  }

  return output;
}

export function createAuditEvent(
  eventId: string,
  context: ProvisioningRequestContext,
  input: Omit<
    ProvisioningAuditEvent,
    "eventId" | "actor" | "timestamp" | "requestId" | "metadata"
  > & { metadata?: Readonly<Record<string, unknown>> },
  now: () => Date,
): ProvisioningAuditEvent {
  return {
    eventId,
    actor: context.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    tenantId: input.tenantId,
    timestamp: now().toISOString(),
    requestId: context.requestId,
    metadata: sanitizeAuditMetadata(input.metadata ?? {}),
  };
}
