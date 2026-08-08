import { createHash, randomUUID } from "node:crypto";

import { z, ZodError } from "zod";

import {
  INVENTORY_MAX_BALANCE_QUANTITY,
  INVENTORY_MAX_LOCATION_DEPTH,
  floorStockConfigurationSchema,
  inventoryBalanceSchema,
  inventoryLocationSchema,
  inventoryLotSchema,
  isExpiredDateOnly,
  medicationItemSchema,
} from "@/domain/inventory/schemas";
import {
  inventoryBalanceId,
  inventoryConversionMultiplier,
} from "@/domain/inventory/balances";
import type {
  InventoryBalanceIdentity,
  InventoryBalanceRecord,
  InventoryLocationRecord,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
} from "@/domain/inventory/types";
import { sanitizeAuditMetadata } from "@/domain/provisioning/audit";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  createFloorStockRequestSchema,
  completeFloorStockRequestSchema,
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
import type {
  FloorStockRequestStore,
  FloorStockRequestTransaction,
} from "./store";

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

async function loadActiveLocation(
  transaction: FloorStockRequestTransaction,
  context: FloorStockRequestActorContext,
  locationId: string,
): Promise<InventoryLocationRecord> {
  const location = inventoryLocationSchema.parse(
    requiredRecord(await transaction.getLocation(locationId)),
  );
  if (
    location.locationId !== locationId ||
    location.status !== "active" ||
    location.tenantId !== context.tenantId ||
    location.platformId !== context.platformId ||
    location.organizationId !== context.organizationId ||
    location.facilityId !== context.activeFacilityId ||
    location.kind === "virtual_adjustment"
  )
    fail("forbidden");
  const visited = new Set([location.locationId]);
  let parentId = location.parentLocationId;
  for (let depth = 0; parentId; depth += 1) {
    if (depth >= INVENTORY_MAX_LOCATION_DEPTH || visited.has(parentId))
      fail("conflict");
    visited.add(parentId);
    const parent = inventoryLocationSchema.parse(
      requiredRecord(await transaction.getLocation(parentId)),
    );
    if (
      parent.locationId !== parentId ||
      parent.status !== "active" ||
      parent.tenantId !== location.tenantId ||
      parent.platformId !== location.platformId ||
      parent.organizationId !== location.organizationId ||
      parent.facilityId !== location.facilityId ||
      parent.kind === "virtual_adjustment" ||
      (parent.departmentId !== null &&
        parent.departmentId !== location.departmentId)
    )
      fail("conflict");
    parentId = parent.parentLocationId;
  }
  return location;
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
            : operation === "complete_fulfillment"
              ? completeFloorStockRequestSchema.parse(rawBody)
              : emptyFloorStockRequestBodySchema.parse(rawBody);
        if (operation === "create" && context.activeDepartmentId === null)
          fail("forbidden");
        if (
          operation === "complete_fulfillment" &&
          context.featureFlags.inventory !== true
        )
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
                  inventoryTransactionLineIds: [],
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
              inventoryTransactionId: null,
              fulfillmentSourceLocationId: null,
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
              const completion = completeFloorStockRequestSchema.parse(body);
              const rawLines = await transaction.listLines(
                request.floorStockRequestId,
                request.lineCount + 1,
              );
              const currentLines = parseCompleteLineSet(rawLines, request);
              if (
                completion.lines.length !== currentLines.length ||
                new Set(completion.lines.map((line) => line.requestLineId))
                  .size !== currentLines.length
              )
                fail("invalid_request");
              const source = await loadActiveLocation(
                transaction,
                context,
                completion.sourceLocationId,
              );
              if (
                source.departmentId !== null ||
                (source.kind !== "pharmacy" && source.kind !== "central_store")
              )
                fail("forbidden");

              const completionByLine = new Map(
                completion.lines.map((line) => [line.requestLineId, line]),
              );
              const inventoryTransactionId = `${auditId}-inventory`;
              const inventoryLines: InventoryTransactionLineRecord[] = [];
              const balances = new Map<
                string,
                {
                  current: InventoryBalanceRecord | null;
                  identity: InventoryBalanceIdentity;
                  delta: number;
                }
              >();

              const addBalanceDelta = async (
                identity: InventoryBalanceIdentity,
                delta: number,
              ) => {
                const expectedId = inventoryBalanceId(identity);
                const cached = balances.get(expectedId);
                if (cached) {
                  cached.delta += delta;
                  return expectedId;
                }
                const raw = await transaction.getBalance(expectedId);
                const current = raw ? inventoryBalanceSchema.parse(raw) : null;
                if (
                  current &&
                  (current.balanceId !== expectedId ||
                    inventoryBalanceId({
                      tenantId: current.tenantId,
                      facilityId: current.facilityId,
                      departmentId: current.departmentId,
                      locationId: current.locationId,
                      itemId: current.itemId,
                      lotId: current.lotId,
                      expiryDate: current.expiryDate,
                      unit: current.unit,
                    }) !== expectedId)
                )
                  fail("conflict");
                balances.set(expectedId, { current, identity, delta });
                return expectedId;
              };

              linesToSet = [];
              for (const requestLine of currentLines) {
                if (
                  requestLine.approvedQuantity === null ||
                  requestLine.fulfilledQuantity !== null ||
                  requestLine.inventoryTransactionLineIds.length > 0
                )
                  fail("conflict");
                const inputLine =
                  completionByLine.get(requestLine.lineId) ??
                  fail("invalid_request");
                const enteredTotal = inputLine.allocations.reduce(
                  (sum, allocation) => sum + allocation.quantity,
                  0,
                );
                if (
                  !Number.isSafeInteger(enteredTotal) ||
                  enteredTotal !== requestLine.approvedQuantity
                )
                  fail("invalid_request");
                const destination = await loadActiveLocation(
                  transaction,
                  context,
                  requestLine.locationId,
                );
                if (
                  destination.departmentId !== request.departmentId ||
                  !["floor_stock", "ward", "clinic", "emergency_unit"].includes(
                    destination.kind,
                  )
                )
                  fail("forbidden");
                const item = medicationItemSchema.parse(
                  requiredRecord(await transaction.getItem(requestLine.itemId)),
                );
                if (
                  item.itemId !== requestLine.itemId ||
                  item.tenantId !== context.tenantId
                )
                  fail("forbidden");
                if (item.status !== "active") fail("inactive_item");
                const multiplier =
                  inventoryConversionMultiplier(item, requestLine.unit) ??
                  fail("invalid_request");
                const transactionLineIds: string[] = [];

                for (const allocation of inputLine.allocations) {
                  const sourceRaw = inventoryBalanceSchema.parse(
                    requiredRecord(
                      await transaction.getBalance(allocation.balanceId),
                    ),
                  );
                  const sourceIdentity: InventoryBalanceIdentity = {
                    tenantId: sourceRaw.tenantId,
                    facilityId: sourceRaw.facilityId,
                    departmentId: sourceRaw.departmentId,
                    locationId: sourceRaw.locationId,
                    itemId: sourceRaw.itemId,
                    lotId: sourceRaw.lotId,
                    expiryDate: sourceRaw.expiryDate,
                    unit: sourceRaw.unit,
                  };
                  if (
                    sourceRaw.balanceId !== allocation.balanceId ||
                    inventoryBalanceId(sourceIdentity) !==
                      allocation.balanceId ||
                    sourceRaw.tenantId !== context.tenantId ||
                    sourceRaw.facilityId !== context.activeFacilityId ||
                    sourceRaw.departmentId !== null ||
                    sourceRaw.locationId !== source.locationId ||
                    sourceRaw.itemId !== item.itemId ||
                    sourceRaw.unit !== item.baseUnit ||
                    sourceRaw.quantity <= 0
                  )
                    fail("conflict");
                  if (item.lotControlled !== (sourceRaw.lotId !== null))
                    fail("conflict");
                  if (!item.lotControlled && sourceRaw.expiryDate !== null)
                    fail("conflict");
                  if (sourceRaw.lotId) {
                    const lot = inventoryLotSchema.parse(
                      requiredRecord(await transaction.getLot(sourceRaw.lotId)),
                    );
                    if (
                      lot.status !== "active" ||
                      lot.tenantId !== context.tenantId ||
                      lot.facilityId !== context.activeFacilityId ||
                      lot.itemId !== item.itemId ||
                      lot.expiryDate !== sourceRaw.expiryDate
                    )
                      fail("conflict");
                    if (
                      item.expiryControlled &&
                      isExpiredDateOnly(lot.expiryDate, now())
                    )
                      fail("expired_lot");
                  } else if (item.expiryControlled) {
                    fail("conflict");
                  }
                  const baseQuantity = allocation.quantity * multiplier;
                  if (
                    !Number.isSafeInteger(baseQuantity) ||
                    baseQuantity > INVENTORY_MAX_BALANCE_QUANTITY
                  )
                    fail("invalid_request");
                  await addBalanceDelta(sourceIdentity, -baseQuantity);
                  await addBalanceDelta(
                    {
                      ...sourceIdentity,
                      departmentId: destination.departmentId,
                      locationId: destination.locationId,
                    },
                    baseQuantity,
                  );
                  const inventoryLineId = `${inventoryTransactionId}-${inventoryLines.length + 1}`;
                  transactionLineIds.push(inventoryLineId);
                  inventoryLines.push({
                    schemaVersion: 1,
                    lineId: inventoryLineId,
                    transactionId: inventoryTransactionId,
                    lineNumber: inventoryLines.length + 1,
                    itemId: item.itemId,
                    lotId: sourceRaw.lotId,
                    expiryDate: sourceRaw.expiryDate,
                    enteredUnit: requestLine.unit,
                    enteredQuantity: allocation.quantity,
                    baseUnit: item.baseUnit,
                    baseQuantity,
                    sourceLocationId: source.locationId,
                    destinationLocationId: destination.locationId,
                    floorStockRequestId: request.floorStockRequestId,
                    floorStockRequestLineId: requestLine.lineId,
                  });
                }
                linesToSet.push({
                  ...requestLine,
                  fulfilledQuantity: requestLine.approvedQuantity,
                  inventoryTransactionLineIds: transactionLineIds,
                });
              }

              const balanceMutations: InventoryBalanceRecord[] = [];
              for (const [balanceId, state] of balances) {
                const quantity = (state.current?.quantity ?? 0) + state.delta;
                if (
                  !Number.isSafeInteger(quantity) ||
                  Math.abs(quantity) > INVENTORY_MAX_BALANCE_QUANTITY
                )
                  fail("conflict");
                if (quantity < 0) fail("insufficient_stock");
                balanceMutations.push({
                  schemaVersion: 1,
                  balanceId,
                  ...state.identity,
                  quantity,
                  version: (state.current?.version ?? 0) + 1,
                  updatedAt: timestamp,
                  lastTransactionId: inventoryTransactionId,
                });
              }
              const inventoryRecord: InventoryTransactionRecord = {
                schemaVersion: 1,
                transactionId: inventoryTransactionId,
                type: "request_fulfillment",
                status: "posted",
                actorUid: context.uid,
                requestId: correlationId,
                tenantId: context.tenantId,
                platformId: context.platformId,
                organizationId: context.organizationId,
                facilityId: context.activeFacilityId,
                sourceDepartmentId: null,
                destinationDepartmentId: request.departmentId,
                sourceLocationId: source.locationId,
                destinationLocationId: null,
                reasonCode: "floor_stock_request",
                lineCount: inventoryLines.length,
                postedAt: timestamp,
                metadata: sanitizeAuditMetadata({
                  floorStockRequestId: request.floorStockRequestId,
                }),
              };
              request = {
                ...transition(request, context.uid, "ready", timestamp),
                inventoryTransactionId,
                fulfillmentSourceLocationId: source.locationId,
              };
              transaction.createInventoryTransaction(inventoryRecord);
              for (const line of inventoryLines)
                transaction.createInventoryLine(line);
              for (const balance of balanceMutations)
                transaction.setInventoryBalance(balance);
              transaction.createInventoryAudit({
                schemaVersion: 1,
                eventId: `${auditId}-inventory-audit`,
                actorUid: context.uid,
                action: "request_fulfillment",
                targetType: "inventory_transaction",
                targetId: inventoryTransactionId,
                requestId: correlationId,
                tenantId: context.tenantId,
                facilityId: context.activeFacilityId,
                sourceDepartmentId: null,
                destinationDepartmentId: request.departmentId,
                timestamp,
                metadata: sanitizeAuditMetadata({
                  floorStockRequestId: request.floorStockRequestId,
                  lineCount: inventoryLines.length,
                }),
              });
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
