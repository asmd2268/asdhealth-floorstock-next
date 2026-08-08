import { createHash, randomUUID } from "node:crypto";

import "server-only";

import { sanitizeAuditMetadata } from "@/domain/provisioning/audit";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  INVENTORY_MAX_BALANCE_QUANTITY,
  INVENTORY_MAX_LOCATION_DEPTH,
  adjustInventorySchema,
  inventoryBalanceSchema,
  inventoryLocationSchema,
  inventoryLotSchema,
  isExpiredDateOnly,
  medicationItemSchema,
  receiveInventorySchema,
  transferInventorySchema,
  issueInventorySchema,
} from "@/domain/inventory/schemas";
import {
  inventoryBalanceId,
  inventoryConversionMultiplier,
} from "@/domain/inventory/balances";
import type {
  InventoryStore,
  InventoryTransactionStore,
} from "@/domain/inventory/store";
import type {
  InventoryActorContext,
  InventoryBalanceIdentity,
  InventoryBalanceRecord,
  InventoryFailureCode,
  InventoryIdempotencyRecord,
  InventoryLocationRecord,
  InventoryOperation,
  InventoryPostingInput,
  InventoryResult,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
  PostedInventoryResult,
} from "@/domain/inventory/types";

class InventoryOperationFailure extends Error {
  constructor(readonly code: InventoryFailureCode) {
    super(code);
  }
}

const fail = (code: InventoryFailureCode): never => {
  throw new InventoryOperationFailure(code);
};

const operationType = {
  receive: "receipt",
  issue: "issue",
  adjust_increase: "adjustment_increase",
  adjust_decrease: "adjustment_decrease",
  transfer: "transfer",
} as const;

function requestNamespace(
  context: InventoryActorContext,
  operation: InventoryOperation,
  requestId: string,
): string {
  return createHash("sha256")
    .update("asdhealth:inventory-request:v1\0", "utf8")
    .update(
      JSON.stringify([context.uid, context.tenantId, operation, requestId]),
    )
    .digest("hex");
}

function payloadHash(input: InventoryPostingInput): string {
  return createHash("sha256")
    .update("asdhealth:inventory-payload:v1\0", "utf8")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
}

function parseInput(operation: InventoryOperation, input: unknown) {
  const schema =
    operation === "receive"
      ? receiveInventorySchema
      : operation === "issue"
        ? issueInventorySchema
        : operation === "transfer"
          ? transferInventorySchema
          : adjustInventorySchema;
  const result = schema.safeParse(input);
  if (!result.success) fail("invalid_request");
  return result.data as InventoryPostingInput;
}

function locationIds(
  operation: InventoryOperation,
  input: InventoryPostingInput,
) {
  if (operation === "receive")
    return { source: null, destination: input.destinationLocationId! };
  if (operation === "issue")
    return { source: input.sourceLocationId!, destination: null };
  if (operation === "transfer")
    return {
      source: input.sourceLocationId!,
      destination: input.destinationLocationId!,
    };
  return operation === "adjust_increase"
    ? { source: null, destination: input.locationId! }
    : { source: input.locationId!, destination: null };
}

async function loadLocation(
  transaction: InventoryTransactionStore,
  context: InventoryActorContext,
  locationId: string,
): Promise<InventoryLocationRecord> {
  const parsed = inventoryLocationSchema.safeParse(
    await transaction.getLocation(locationId),
  );
  if (!parsed.success) fail("not_found");
  const location = parsed.data!;
  if (
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
    const parent = inventoryLocationSchema.safeParse(
      await transaction.getLocation(parentId),
    );
    if (!parent.success) fail("conflict");
    const parentLocation = parent.data!;
    if (
      parentLocation.status !== "active" ||
      parentLocation.tenantId !== location.tenantId ||
      parentLocation.platformId !== location.platformId ||
      parentLocation.organizationId !== location.organizationId ||
      parentLocation.facilityId !== location.facilityId ||
      parentLocation.kind === "virtual_adjustment" ||
      (parentLocation.departmentId !== null &&
        parentLocation.departmentId !== location.departmentId)
    )
      fail("conflict");
    parentId = parentLocation.parentLocationId;
  }
  return location;
}

export function createInventoryService(
  store: InventoryStore,
  dependencies: { now?: () => Date; id?: () => string } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const id = dependencies.id ?? randomUUID;

  return {
    async post(
      context: InventoryActorContext,
      operation: InventoryOperation,
      requestId: string,
      rawInput: unknown,
    ): Promise<InventoryResult<PostedInventoryResult>> {
      let input: InventoryPostingInput;
      try {
        if (!provisioningIdentifierSchema.safeParse(requestId).success)
          fail("invalid_request");
        input = parseInput(operation, rawInput);
      } catch (error) {
        return {
          ok: false,
          code:
            error instanceof InventoryOperationFailure
              ? error.code
              : "invalid_request",
        };
      }
      const namespaceId = requestNamespace(context, operation, requestId);
      const expectedPayloadHash = payloadHash(input);
      try {
        return await store.runTransaction(async (transaction) => {
          if (!(await transaction.revalidateActor(context, operation)))
            fail("forbidden");
          const existing = await transaction.getRequest(namespaceId);
          if (existing !== null) {
            const marker = existing as Partial<InventoryIdempotencyRecord>;
            if (
              marker.schemaVersion !== 1 ||
              marker.namespaceId !== namespaceId ||
              marker.actorUid !== context.uid ||
              marker.tenantId !== context.tenantId ||
              marker.operation !== operation ||
              marker.requestId !== requestId ||
              marker.payloadHash !== expectedPayloadHash ||
              typeof marker.transactionId !== "string"
            )
              fail("conflict");
            const existingTransactionId = marker.transactionId as string;
            return {
              ok: true as const,
              value: { transactionId: existingTransactionId, duplicate: true },
            };
          }

          const ids = locationIds(operation, input);
          const source = ids.source
            ? await loadLocation(transaction, context, ids.source)
            : null;
          const destination = ids.destination
            ? await loadLocation(transaction, context, ids.destination)
            : null;
          const transactionId = id();
          const postedAt = now().toISOString();
          const mutations: InventoryBalanceRecord[] = [];
          const lines: InventoryTransactionLineRecord[] = [];
          const seenBalances = new Set<string>();

          for (const [index, line] of input.lines.entries()) {
            const itemResult = medicationItemSchema.safeParse(
              await transaction.getItem(line.itemId),
            );
            if (
              !itemResult.success ||
              itemResult.data.tenantId !== context.tenantId
            )
              fail("not_found");
            const item = itemResult.data!;
            if (item.status !== "active") fail("inactive_item");
            const multiplier =
              inventoryConversionMultiplier(item, line.unit) ??
              fail("invalid_request");
            const baseQuantity = line.quantity * multiplier;
            if (
              !Number.isSafeInteger(baseQuantity) ||
              baseQuantity > INVENTORY_MAX_BALANCE_QUANTITY
            )
              fail("invalid_request");

            const lotId: string | null = line.lotId ?? null;
            let expiryDate: string | null = line.expiryDate ?? null;
            if (item.lotControlled && !lotId) fail("invalid_request");
            if (item.expiryControlled && !expiryDate) fail("invalid_request");
            if (!item.lotControlled && (lotId || expiryDate))
              fail("invalid_request");
            if (lotId) {
              const lotResult = inventoryLotSchema.safeParse(
                await transaction.getLot(lotId),
              );
              if (
                !lotResult.success ||
                lotResult.data.status !== "active" ||
                lotResult.data.tenantId !== context.tenantId ||
                lotResult.data.facilityId !== context.activeFacilityId ||
                lotResult.data.itemId !== item.itemId ||
                (expiryDate !== null &&
                  lotResult.data.expiryDate !== expiryDate)
              )
                fail("conflict");
              expiryDate = lotResult.data!.expiryDate;
              if (
                isExpiredDateOnly(expiryDate, now()) &&
                item.expiryControlled &&
                operation !== "adjust_decrease"
              )
                fail("expired_lot");
            }

            const targets: Array<{
              location: InventoryLocationRecord;
              delta: number;
            }> = [];
            if (operation === "receive" || operation === "adjust_increase")
              targets.push({ location: destination!, delta: baseQuantity });
            else if (operation === "issue" || operation === "adjust_decrease")
              targets.push({ location: source!, delta: -baseQuantity });
            else {
              targets.push({ location: source!, delta: -baseQuantity });
              targets.push({ location: destination!, delta: baseQuantity });
            }

            for (const target of targets) {
              const identity: InventoryBalanceIdentity = {
                tenantId: context.tenantId,
                facilityId: context.activeFacilityId,
                departmentId: target.location.departmentId,
                locationId: target.location.locationId,
                itemId: item.itemId,
                lotId,
                expiryDate,
                unit: item.baseUnit,
              };
              const targetBalanceId = inventoryBalanceId(identity);
              if (seenBalances.has(targetBalanceId)) fail("conflict");
              seenBalances.add(targetBalanceId);
              const currentRaw = await transaction.getBalance(targetBalanceId);
              const currentResult = currentRaw
                ? inventoryBalanceSchema.safeParse(currentRaw)
                : null;
              if (currentResult && !currentResult.success) fail("conflict");
              const current = currentResult?.success
                ? currentResult.data
                : null;
              if (
                current &&
                (current.balanceId !== targetBalanceId ||
                  JSON.stringify({
                    tenantId: current.tenantId,
                    facilityId: current.facilityId,
                    departmentId: current.departmentId,
                    locationId: current.locationId,
                    itemId: current.itemId,
                    lotId: current.lotId,
                    expiryDate: current.expiryDate,
                    unit: current.unit,
                  }) !== JSON.stringify(identity))
              )
                fail("conflict");
              const quantity = (current?.quantity ?? 0) + target.delta;
              if (
                !Number.isSafeInteger(quantity) ||
                Math.abs(quantity) > INVENTORY_MAX_BALANCE_QUANTITY
              )
                fail("conflict");
              if (quantity < 0 && !item.negativeStockAllowed)
                fail("insufficient_stock");
              mutations.push({
                schemaVersion: 1,
                balanceId: targetBalanceId,
                ...identity,
                quantity,
                version: (current?.version ?? 0) + 1,
                updatedAt: postedAt,
                lastTransactionId: transactionId,
              });
            }
            lines.push({
              schemaVersion: 1,
              lineId: `${transactionId}-${index + 1}`,
              transactionId,
              lineNumber: index + 1,
              itemId: item.itemId,
              lotId,
              expiryDate,
              enteredUnit: line.unit,
              enteredQuantity: line.quantity,
              baseUnit: item.baseUnit,
              baseQuantity,
              sourceLocationId: source?.locationId ?? null,
              destinationLocationId: destination?.locationId ?? null,
              floorStockRequestId: null,
              floorStockRequestLineId: null,
            });
          }

          const record: InventoryTransactionRecord = {
            schemaVersion: 1,
            transactionId,
            type: operationType[operation],
            status: "posted",
            actorUid: context.uid,
            requestId,
            tenantId: context.tenantId,
            platformId: context.platformId,
            organizationId: context.organizationId,
            facilityId: context.activeFacilityId,
            sourceDepartmentId: source?.departmentId ?? null,
            destinationDepartmentId: destination?.departmentId ?? null,
            sourceLocationId: source?.locationId ?? null,
            destinationLocationId: destination?.locationId ?? null,
            reasonCode: input.reasonCode ?? null,
            lineCount: lines.length,
            postedAt,
            metadata: {},
          };
          transaction.createTransaction(record);
          lines.forEach((line) => transaction.createLine(line));
          mutations.forEach((balance) => transaction.setBalance(balance));
          transaction.createAudit({
            schemaVersion: 1,
            eventId: id(),
            actorUid: context.uid,
            action: operation,
            targetType: "inventory_transaction",
            targetId: transactionId,
            requestId,
            tenantId: context.tenantId,
            facilityId: context.activeFacilityId,
            sourceDepartmentId: source?.departmentId ?? null,
            destinationDepartmentId: destination?.departmentId ?? null,
            timestamp: postedAt,
            metadata: sanitizeAuditMetadata({ lineCount: lines.length }),
          });
          transaction.createRequest({
            schemaVersion: 1,
            namespaceId,
            actorUid: context.uid,
            tenantId: context.tenantId,
            operation,
            requestId,
            payloadHash: expectedPayloadHash,
            transactionId,
            createdAt: postedAt,
          });
          return {
            ok: true as const,
            value: { transactionId, duplicate: false },
          };
        });
      } catch (error) {
        return {
          ok: false,
          code:
            error instanceof InventoryOperationFailure
              ? error.code
              : "provider_unavailable",
        };
      }
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
