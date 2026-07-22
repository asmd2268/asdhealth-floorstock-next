import type {
  ProvisioningAuditEvent,
  ProvisioningRequestContext,
} from "./types";

const forbiddenMetadataKey =
  /secret|token|password|credential|private.?key|authorization|cookie/i;
const maxMetadataEntries = 20;
const maxMetadataStringLength = 128;

export function sanitizeAuditMetadata(
  input: Readonly<Record<string, unknown>>,
): ProvisioningAuditEvent["metadata"] {
  const output: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(input).slice(
    0,
    maxMetadataEntries,
  )) {
    if (forbiddenMetadataKey.test(key)) continue;
    if (typeof value === "string") {
      output[key] = value.slice(0, maxMetadataStringLength);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = value;
    }
  }

  return output;
}

export function createAuditEvent(
  context: ProvisioningRequestContext,
  input: Omit<
    ProvisioningAuditEvent,
    "eventId" | "actor" | "timestamp" | "requestId" | "metadata"
  > & { metadata?: Readonly<Record<string, unknown>> },
  now: () => Date,
): ProvisioningAuditEvent {
  return {
    eventId: context.requestId,
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
