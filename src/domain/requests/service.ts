import { createHash, randomUUID } from "node:crypto";

import { z, ZodError } from "zod";

import {
  floorStockConfigurationSchema,
  inventoryLocationSchema,
  medicationItemSchema,
} from "@/domain/inventory/schemas";
import { sanitizeAuditMetadata } from "@/domain/provisioning/audit";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  createFloorStockRequestSchema,
  emptyFloorStockRequestBodySchema,
  floorStockRequestLineRecordSchema,
  floorStockRequestRecordSchema,
} from "./schemas";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestFailureCode,
  FloorStockRequestIdempotencyRecord,
  FloorStockRequestLineRecord,
  FloorStockRequestOperation,
  FloorStockRequestRecord,
  FloorStockRequestResult,
  FloorStockRequestStatus,
  MutatedFloorStockRequestResult,
} from "./types";
import type { FloorStockRequestStore } from "./store";

const idempotencySchema = z
  .object({
    schemaVersion: z.literal(1),
    namespaceId: provisioningIdentifierSchema,
    actorUid: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    operation: z.enum([
      "create",
      "submit",
      "approve",
      "reject",
      "start_fulfillment",
      "complete_fulfillment",
      "deliver",
      "cancel",
    ]),
    requestId: provisioningIdentifierSchema,
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
    floorStockRequestId: provisioningIdentifierSchema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

class RequestOperationError extends Error {
  constructor(readonly code: FloorStockRequestFailureCode) {
    super(code);
  }
}

const fail = (code: FloorStockRequestFailureCode): never => {
  throw new RequestOperationError(code);
};

function requiredRecord(value: unknown | null) {
  if (value === null) fail("not_found");
  return value;
}

function namespace(
  context: FloorStockRequestActorContext,
  operation: FloorStockRequestOperation,
  requestId: string,
) {
  return createHash("sha256")
    .update("asdhealth:floor-stock-request:idempotency:v1\0", "utf8")
    .update(
      JSON.stringify([context.uid, context.tenantId, operation, requestId]),
      "utf8",
    )
    .digest("hex");
}

function payloadHash(
  operation: FloorStockRequestOperation,
  floorStockRequestId: string | null,
  body: unknown,
) {
  return createHash("sha256")
    .update("asdhealth:floor-stock-request:payload:v1\0", "utf8")
    .update(JSON.stringify([operation, floorStockRequestId, body]), "utf8")
    .digest("hex");
}

function mapFailure(error: unknown): FloorStockRequestResult<never> {
  if (error instanceof RequestOperationError)
    return { ok: false, code: error.code };
  if (error instanceof ZodError) return { ok: false, code: "invalid_request" };
  return { ok: false, code: "provider_unavailable" };
}

function assertRequestScope(
  context: FloorStockRequestActorContext,
  request: FloorStockRequestRecord,
) {
  if (
    request.tenantId !== context.tenantId ||
    request.platformId !== context.platformId ||
    request.organizationId !== context.organizationId ||
    request.facilityId !== context.activeFacilityId
  )
    fail("forbidden");
}

function assertCreatorDepartment(
  context: FloorStockRequestActorContext,
  request: FloorStockRequestRecord,
) {
  if (
    context.activeDepartmentId === null ||
    request.departmentId !== context.activeDepartmentId ||
    request.requestedByUid !== context.uid
  )
    fail("forbidden");
}

function assertStatus(
  request: FloorStockRequestRecord,
  expected: FloorStockRequestStatus,
) {
  if (request.status !== expected) fail("conflict");
}

function parseCompleteLineSet(
  rawLines: readonly unknown[],
  request: FloorStockRequestRecord,
) {
  if (rawLines.length !== request.lineCount) fail("conflict");
  const lines = rawLines.map((raw) =>
    floorStockRequestLineRecordSchema.parse(raw),
  );
  if (
    lines.some(
      (line) => line.floorStockRequestId !== request.floorStockRequestId,
    ) ||
    new Set(lines.map((line) => line.lineId)).size !== request.lineCount ||
    new Set(lines.map((line) => line.lineNumber)).size !== request.lineCount ||
    lines.some((line, index) => line.lineNumber !== index + 1)
  )
    fail("conflict");
  return lines;
}

const transition = (
  request: FloorStockRequestRecord,
  actorUid: string,
  status: FloorStockRequestStatus,
  timestamp: string,
): FloorStockRequestRecord => ({
  ...request,
  status,
  lastActorUid: actorUid,
  version: request.version + 1,
  updatedAt: timestamp,
  ...(status === "submitted" ? { submittedAt: timestamp } : {}),
  ...(status === "approved" ? { approvedAt: timestamp } : {}),
  ...(status === "rejected" ? { rejectedAt: timestamp } : {}),
  ...(status === "fulfilling" ? { fulfillmentStartedAt: timestamp } : {}),
  ...(status === "ready" ? { readyAt: timestamp } : {}),
  ...(status === "delivered" ? { deliveredAt: timestamp } : {}),
  ...(status === "cancelled" ? { cancelledAt: timestamp } : {}),
});

export interface FloorStockRequestService {
  mutate(
    context: FloorStockRequestActorContext,
    operation: FloorStockRequestOperation,
    correlationId: string,
    floorStockRequestId: string | null,
    body: unknown,
  ): Promise<FloorStockRequestResult<MutatedFloorStockRequestResult>>;
}

export function createFloorStockRequestService(
  store: FloorStockRequestStore,
  now: () => Date = () => new Date(),
  requestIdGenerator: () => string = randomUUID,
  auditIdGenerator: () => string = randomUUID,
): FloorStockRequestService {
  return {
    async mutate(context, operation, rawCorrelationId, rawTargetId, rawBody) {
      try {
        const correlationId =
          provisioningIdentifierSchema.parse(rawCorrelationId);
        const targetId =
          operation === "create"
            ? null
            : provisioningIdentifierSchema.parse(rawTargetId);
        const body =
          operation === "create"
            ? createFloorStockRequestSchema.parse(rawBody)
            : emptyFloorStockRequestBodySchema.parse(rawBody);
        if (operation === "create" && context.activeDepartmentId === null)
          fail("forbidden");

        const idempotencyId = namespace(context, operation, correlationId);
        const hash = payloadHash(operation, targetId, body);
        const generatedTargetId =
          provisioningIdentifierSchema.parse(requestIdGenerator());
        const auditId = provisioningIdentifierSchema.parse(auditIdGenerator());
        const timestamp = now().toISOString();

        return await store.runTransaction(async (transaction) => {
          if (!(await transaction.revalidateActor(context, operation)))
            fail("forbidden");

          const existingMarkerRaw =
            await transaction.getIdempotency(idempotencyId);
          if (existingMarkerRaw) {
            const marker = idempotencySchema.parse(existingMarkerRaw);
            if (
              marker.namespaceId !== idempotencyId ||
              marker.actorUid !== context.uid ||
              marker.tenantId !== context.tenantId ||
              marker.operation !== operation ||
              marker.requestId !== correlationId ||
              marker.payloadHash !== hash
            )
              fail("conflict");
            const duplicateRequest = floorStockRequestRecordSchema.parse(
              requiredRecord(
                await transaction.getRequest(marker.floorStockRequestId),
              ),
            );
            assertRequestScope(context, duplicateRequest);
            return {
              ok: true,
              value: {
                floorStockRequestId: duplicateRequest.floorStockRequestId,
                status: duplicateRequest.status,
                duplicate: true,
              },
            };
          }

          let request: FloorStockRequestRecord;
          let fromStatus: FloorStockRequestStatus | null = null;
          let linesToCreate: FloorStockRequestLineRecord[] = [];
          let linesToSet: FloorStockRequestLineRecord[] = [];

          if (operation === "create") {
            const departmentId = context.activeDepartmentId;
            if (!departmentId) fail("forbidden");
            const parsedBody = createFloorStockRequestSchema.parse(body);
            const validatedLines: FloorStockRequestLineRecord[] = [];
            for (const [index, inputLine] of parsedBody.lines.entries()) {
              const configuration = floorStockConfigurationSchema.parse(
                requiredRecord(
                  await transaction.getConfiguration(inputLine.configurationId),
                ),
              );
              if (
                configuration.configurationId !== inputLine.configurationId ||
                configuration.tenantId !== context.tenantId ||
                configuration.organizationId !== context.organizationId ||
                configuration.facilityId !== context.activeFacilityId ||
                configuration.departmentId !== departmentId
              )
                fail("forbidden");
              if (configuration.status !== "active")
                fail("inactive_configuration");
              if (inputLine.quantity > configuration.maximumQuantity)
                fail("invalid_request");
              const item = medicationItemSchema.parse(
                requiredRecord(await transaction.getItem(configuration.itemId)),
              );
              if (
                item.itemId !== configuration.itemId ||
                item.tenantId !== context.tenantId
              )
                fail("forbidden");
              if (item.status !== "active") fail("inactive_item");
              const location = inventoryLocationSchema.parse(
                requiredRecord(
                  await transaction.getLocation(configuration.locationId),
                ),
              );
              if (
                location.locationId !== configuration.locationId ||
                location.tenantId !== context.tenantId ||
                location.organizationId !== context.organizationId ||
                location.facilityId !== context.activeFacilityId ||
                location.departmentId !== departmentId
              )
                fail("forbidden");
              if (location.status !== "active") fail("inactive_configuration");
              validatedLines.push(
                floorStockRequestLineRecordSchema.parse({
                  schemaVersion: 1,
                  lineId: `${generatedTargetId}-line-${index + 1}`,
                  floorStockRequestId: generatedTargetId,
                  lineNumber: index + 1,
                  configurationId: configuration.configurationId,
                  itemId: configuration.itemId,
                  locationId: configuration.locationId,
                  unit: configuration.unit,
                  requestedQuantity: inputLine.quantity,
                  approvedQuantity: null,
                  fulfilledQuantity: null,
                }),
              );
            }
            request = floorStockRequestRecordSchema.parse({
              schemaVersion: 1,
              floorStockRequestId: generatedTargetId,
              tenantId: context.tenantId,
              platformId: context.platformId,
              organizationId: context.organizationId,
              facilityId: context.activeFacilityId,
              departmentId,
              status: "draft",
              requestedByUid: context.uid,
              lastActorUid: context.uid,
              lineCount: validatedLines.length,
              note: parsedBody.note ?? null,
              version: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
              submittedAt: null,
              approvedAt: null,
              rejectedAt: null,
              fulfillmentStartedAt: null,
              readyAt: null,
              deliveredAt: null,
              cancelledAt: null,
            });
            linesToCreate = validatedLines;
          } else {
            request = floorStockRequestRecordSchema.parse(
              requiredRecord(await transaction.getRequest(targetId as string)),
            );
            if (request.floorStockRequestId !== targetId) fail("conflict");
            assertRequestScope(context, request);
            fromStatus = request.status;
            if (operation === "submit") {
              assertCreatorDepartment(context, request);
              assertStatus(request, "draft");
              request = transition(
                request,
                context.uid,
                "submitted",
                timestamp,
              );
            } else if (operation === "approve") {
              assertStatus(request, "submitted");
              const rawLines = await transaction.listLines(
                request.floorStockRequestId,
                request.lineCount + 1,
              );
              linesToSet = parseCompleteLineSet(rawLines, request).map(
                (line) => {
                  if (
                    line.approvedQuantity !== null ||
                    line.fulfilledQuantity !== null
                  )
                    fail("conflict");
                  return { ...line, approvedQuantity: line.requestedQuantity };
                },
              );
              request = transition(request, context.uid, "approved", timestamp);
            } else if (operation === "reject") {
              assertStatus(request, "submitted");
              request = transition(request, context.uid, "rejected", timestamp);
            } else if (operation === "start_fulfillment") {
              assertStatus(request, "approved");
              request = transition(
                request,
                context.uid,
                "fulfilling",
                timestamp,
              );
            } else if (operation === "complete_fulfillment") {
              assertStatus(request, "fulfilling");
              const rawLines = await transaction.listLines(
                request.floorStockRequestId,
                request.lineCount + 1,
              );
              linesToSet = parseCompleteLineSet(rawLines, request).map(
                (line) => {
                  if (
                    line.approvedQuantity === null ||
                    line.fulfilledQuantity !== null
                  )
                    fail("conflict");
                  return {
                    ...line,
                    fulfilledQuantity: line.approvedQuantity,
                  };
                },
              );
              request = transition(request, context.uid, "ready", timestamp);
            } else if (operation === "deliver") {
              assertStatus(request, "ready");
              request = transition(
                request,
                context.uid,
                "delivered",
                timestamp,
              );
            } else {
              assertCreatorDepartment(context, request);
              if (request.status !== "draft" && request.status !== "submitted")
                fail("conflict");
              request = transition(
                request,
                context.uid,
                "cancelled",
                timestamp,
              );
            }
          }

          const marker: FloorStockRequestIdempotencyRecord = {
            schemaVersion: 1,
            namespaceId: idempotencyId,
            actorUid: context.uid,
            tenantId: context.tenantId,
            operation,
            requestId: correlationId,
            payloadHash: hash,
            floorStockRequestId: request.floorStockRequestId,
            createdAt: timestamp,
          };
          if (operation === "create") transaction.createRequest(request);
          else transaction.setRequest(request);
          for (const line of linesToCreate) transaction.createLine(line);
          for (const line of linesToSet) transaction.setLine(line);
          transaction.createAudit({
            schemaVersion: 1,
            eventId: auditId,
            actorUid: context.uid,
            action: operation,
            targetType: "floor_stock_request",
            targetId: request.floorStockRequestId,
            requestId: correlationId,
            tenantId: context.tenantId,
            facilityId: context.activeFacilityId,
            departmentId: request.departmentId,
            timestamp,
            metadata: sanitizeAuditMetadata({
              fromStatus,
              status: request.status,
              lineCount: request.lineCount,
            }),
          });
          transaction.createIdempotency(marker);
          return {
            ok: true,
            value: {
              floorStockRequestId: request.floorStockRequestId,
              status: request.status,
              duplicate: false,
            },
          };
        });
      } catch (error) {
        return mapFailure(error);
      }
    },
  };
}
