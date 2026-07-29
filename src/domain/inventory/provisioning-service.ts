import { createHash, randomUUID } from "node:crypto";

import type { ZodType } from "zod";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import { validateMedicationCatalogMutation } from "./catalog";
import {
  floorStockConfigurationSchema,
  inventoryLocationSchema,
  inventoryLotSchema,
  medicationItemSchema,
  INVENTORY_MAX_LOCATION_DEPTH,
} from "./schemas";
import {
  floorStockConfigurationProvisioningSchema,
  inventoryLocationProvisioningSchema,
  inventoryLotProvisioningSchema,
  medicationItemProvisioningSchema,
} from "./provisioning-schemas";
import type {
  InventoryProvisioningStore,
  InventoryProvisioningTransaction,
} from "./provisioning-store";
import type {
  InventoryProvisioningActorContext,
  InventoryProvisioningAuditRecord,
  InventoryProvisioningInput,
  InventoryProvisioningOperation,
  InventoryProvisioningRequestRecord,
  InventoryProvisioningResult,
} from "./provisioning-types";
import type {
  FloorStockConfigurationRecord,
  InventoryFailureCode,
  InventoryLocationRecord,
  InventoryLotRecord,
  InventoryResult,
  MedicationItemRecord,
} from "./types";

class ProvisioningFailure extends Error {
  constructor(readonly code: InventoryFailureCode) {
    super(code);
  }
}

function fail(code: InventoryFailureCode): never {
  throw new ProvisioningFailure(code);
}

function parseInput(
  operation: InventoryProvisioningOperation,
  raw: unknown,
): InventoryProvisioningInput {
  const schema =
    operation === "upsert_item"
      ? medicationItemProvisioningSchema
      : operation === "upsert_location"
        ? inventoryLocationProvisioningSchema
        : operation === "upsert_lot"
          ? inventoryLotProvisioningSchema
          : floorStockConfigurationProvisioningSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail("invalid_request");
  return parsed.data as InventoryProvisioningInput;
}

function namespace(
  context: InventoryProvisioningActorContext,
  operation: InventoryProvisioningOperation,
  requestId: string,
): string {
  return createHash("sha256")
    .update("asdhealth:inventory-provisioning-request:v1\0", "utf8")
    .update(
      JSON.stringify([context.uid, context.tenantId, operation, requestId]),
      "utf8",
    )
    .digest("hex");
}

function payloadHash(
  operation: InventoryProvisioningOperation,
  targetId: string,
  input: InventoryProvisioningInput,
): string {
  return createHash("sha256")
    .update("asdhealth:inventory-provisioning-payload:v1\0", "utf8")
    .update(JSON.stringify([operation, targetId, input]), "utf8")
    .digest("hex");
}

function parseExisting<T>(raw: unknown | null, parser: ZodType<T>): T | null {
  if (raw === null) return null;
  const parsed = parser.safeParse(raw);
  if (!parsed.success) fail("conflict");
  return parsed.data;
}

function parseCandidate<T>(value: unknown, parser: ZodType<T>): T {
  const parsed = parser.safeParse(value);
  if (!parsed.success) fail("invalid_request");
  return parsed.data;
}

async function itemMutation(
  transaction: InventoryProvisioningTransaction,
  context: InventoryProvisioningActorContext,
  itemId: string,
  input: InventoryProvisioningInput,
): Promise<MedicationItemRecord> {
  const body = medicationItemProvisioningSchema.parse(input);
  const candidate = parseCandidate(
    {
      schemaVersion: 1,
      itemId,
      tenantId: context.tenantId,
      ...body,
    },
    medicationItemSchema,
  );
  const existing = parseExisting(
    await transaction.getItem(itemId),
    medicationItemSchema,
  );
  if (
    existing &&
    (existing.itemId !== itemId || existing.tenantId !== context.tenantId)
  )
    fail("conflict");
  const rawMatches = await transaction.listItemsByCode(
    context.tenantId,
    candidate.itemCode,
    2,
  );
  if (rawMatches.length > 2) fail("provider_unavailable");
  const tenantItems = rawMatches.map((raw) => {
    const parsed = medicationItemSchema.safeParse(raw);
    if (!parsed.success || parsed.data.tenantId !== context.tenantId)
      fail("provider_unavailable");
    return parsed.data;
  });
  const result = validateMedicationCatalogMutation({
    candidate,
    existing,
    tenantItems,
    hasInventoryActivity: await transaction.hasItemActivity(
      context.tenantId,
      itemId,
    ),
  });
  if (!result.ok) fail(result.code);
  return result.value;
}

async function locationMutation(
  transaction: InventoryProvisioningTransaction,
  context: InventoryProvisioningActorContext,
  locationId: string,
  input: InventoryProvisioningInput,
): Promise<InventoryLocationRecord> {
  const body = inventoryLocationProvisioningSchema.parse(input);
  if (body.kind === "virtual_adjustment") fail("invalid_request");
  const candidate = parseCandidate(
    {
      schemaVersion: 1,
      locationId,
      tenantId: context.tenantId,
      platformId: context.platformId,
      organizationId: context.organizationId,
      facilityId: context.activeFacilityId,
      ...body,
    },
    inventoryLocationSchema,
  );
  const existing = parseExisting(
    await transaction.getLocation(locationId),
    inventoryLocationSchema,
  );
  if (
    existing &&
    (existing.locationId !== locationId ||
      existing.tenantId !== context.tenantId ||
      existing.platformId !== context.platformId ||
      existing.organizationId !== context.organizationId ||
      existing.facilityId !== context.activeFacilityId)
  )
    fail("conflict");

  const visited = new Set([locationId]);
  let parentId = candidate.parentLocationId;
  for (let depth = 0; parentId; depth += 1) {
    if (depth >= INVENTORY_MAX_LOCATION_DEPTH || visited.has(parentId))
      fail("conflict");
    visited.add(parentId);
    const parent = parseExisting(
      await transaction.getLocation(parentId),
      inventoryLocationSchema,
    );
    if (
      !parent ||
      parent.tenantId !== context.tenantId ||
      parent.platformId !== context.platformId ||
      parent.organizationId !== context.organizationId ||
      parent.facilityId !== context.activeFacilityId ||
      parent.kind === "virtual_adjustment" ||
      (candidate.status === "active" && parent.status !== "active") ||
      (parent.departmentId !== null &&
        parent.departmentId !== candidate.departmentId)
    )
      fail("conflict");
    parentId = parent.parentLocationId;
  }

  const hasActivity = await transaction.hasLocationActivity(
    context.tenantId,
    context.activeFacilityId,
    locationId,
  );
  if (
    existing &&
    hasActivity &&
    (existing.departmentId !== candidate.departmentId ||
      existing.parentLocationId !== candidate.parentLocationId ||
      existing.kind !== candidate.kind)
  )
    fail("conflict");
  return candidate;
}

async function lotMutation(
  transaction: InventoryProvisioningTransaction,
  context: InventoryProvisioningActorContext,
  lotId: string,
  input: InventoryProvisioningInput,
): Promise<InventoryLotRecord> {
  const body = inventoryLotProvisioningSchema.parse(input);
  const candidate = parseCandidate(
    {
      schemaVersion: 1,
      lotId,
      tenantId: context.tenantId,
      facilityId: context.activeFacilityId,
      ...body,
    },
    inventoryLotSchema,
  );
  const item = parseExisting(
    await transaction.getItem(candidate.itemId),
    medicationItemSchema,
  );
  if (
    !item ||
    item.tenantId !== context.tenantId ||
    item.status !== "active" ||
    !item.lotControlled
  )
    fail("conflict");
  const existing = parseExisting(
    await transaction.getLot(lotId),
    inventoryLotSchema,
  );
  if (
    existing &&
    (existing.lotId !== lotId ||
      existing.tenantId !== context.tenantId ||
      existing.facilityId !== context.activeFacilityId)
  )
    fail("conflict");
  const rawMatches = await transaction.listLotsByIdentity(
    context.tenantId,
    context.activeFacilityId,
    candidate.itemId,
    candidate.lotNumber,
    2,
  );
  if (rawMatches.length > 2) fail("provider_unavailable");
  for (const raw of rawMatches) {
    const parsed = inventoryLotSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.tenantId !== context.tenantId ||
      parsed.data.facilityId !== context.activeFacilityId
    )
      fail("provider_unavailable");
    if (parsed.data.lotId !== lotId) fail("conflict");
  }
  const hasActivity = await transaction.hasLotActivity(
    context.tenantId,
    context.activeFacilityId,
    lotId,
  );
  if (
    existing &&
    hasActivity &&
    (existing.itemId !== candidate.itemId ||
      existing.lotNumber !== candidate.lotNumber ||
      existing.expiryDate !== candidate.expiryDate)
  )
    fail("conflict");
  return candidate;
}

async function configurationMutation(
  transaction: InventoryProvisioningTransaction,
  context: InventoryProvisioningActorContext,
  configurationId: string,
  input: InventoryProvisioningInput,
): Promise<FloorStockConfigurationRecord> {
  const body = floorStockConfigurationProvisioningSchema.parse(input);
  const candidate = parseCandidate(
    {
      schemaVersion: 1,
      configurationId,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      facilityId: context.activeFacilityId,
      ...body,
    },
    floorStockConfigurationSchema,
  );
  const [location, item, existing] = await Promise.all([
    transaction.getLocation(candidate.locationId),
    transaction.getItem(candidate.itemId),
    transaction.getConfiguration(configurationId),
  ]);
  const parsedLocation = parseExisting(location, inventoryLocationSchema);
  const parsedItem = parseExisting(item, medicationItemSchema);
  const parsedExisting = parseExisting(existing, floorStockConfigurationSchema);
  if (
    !parsedLocation ||
    parsedLocation.tenantId !== context.tenantId ||
    parsedLocation.organizationId !== context.organizationId ||
    parsedLocation.facilityId !== context.activeFacilityId ||
    parsedLocation.departmentId !== candidate.departmentId ||
    parsedLocation.status !== "active" ||
    !parsedItem ||
    parsedItem.tenantId !== context.tenantId ||
    parsedItem.status !== "active" ||
    (candidate.unit !== parsedItem.baseUnit &&
      !parsedItem.unitConversions.some(
        (entry) => entry.fromUnit === candidate.unit,
      ))
  )
    fail("conflict");
  if (
    parsedExisting &&
    (parsedExisting.configurationId !== configurationId ||
      parsedExisting.tenantId !== context.tenantId ||
      parsedExisting.organizationId !== context.organizationId ||
      parsedExisting.facilityId !== context.activeFacilityId ||
      parsedExisting.departmentId !== candidate.departmentId ||
      parsedExisting.locationId !== candidate.locationId ||
      parsedExisting.itemId !== candidate.itemId ||
      parsedExisting.unit !== candidate.unit)
  )
    fail("conflict");
  const rawMatches = await transaction.listConfigurationsByIdentity(
    context.tenantId,
    context.activeFacilityId,
    candidate.departmentId,
    candidate.locationId,
    candidate.itemId,
    2,
  );
  if (rawMatches.length > 2) fail("provider_unavailable");
  for (const raw of rawMatches) {
    const parsed = floorStockConfigurationSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.tenantId !== context.tenantId ||
      parsed.data.facilityId !== context.activeFacilityId
    )
      fail("provider_unavailable");
    if (parsed.data.configurationId !== configurationId) fail("conflict");
  }
  return candidate;
}

type ProvisionedRecord =
  | { kind: "item"; value: MedicationItemRecord }
  | { kind: "location"; value: InventoryLocationRecord }
  | { kind: "lot"; value: InventoryLotRecord }
  | { kind: "configuration"; value: FloorStockConfigurationRecord };

async function prepareRecord(
  transaction: InventoryProvisioningTransaction,
  context: InventoryProvisioningActorContext,
  operation: InventoryProvisioningOperation,
  targetId: string,
  input: InventoryProvisioningInput,
): Promise<ProvisionedRecord> {
  if (operation === "upsert_item")
    return {
      kind: "item",
      value: await itemMutation(transaction, context, targetId, input),
    };
  if (operation === "upsert_location")
    return {
      kind: "location",
      value: await locationMutation(transaction, context, targetId, input),
    };
  if (operation === "upsert_lot")
    return {
      kind: "lot",
      value: await lotMutation(transaction, context, targetId, input),
    };
  return {
    kind: "configuration",
    value: await configurationMutation(transaction, context, targetId, input),
  };
}

const auditTarget = {
  upsert_item: "inventory_item",
  upsert_location: "inventory_location",
  upsert_lot: "inventory_lot",
  upsert_floor_stock_configuration: "floor_stock_configuration",
} as const;

export function createInventoryProvisioningService(
  store: InventoryProvisioningStore,
  dependencies: { now?: () => Date; id?: () => string } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const id = dependencies.id ?? randomUUID;
  return {
    async upsert(
      context: InventoryProvisioningActorContext,
      operation: InventoryProvisioningOperation,
      targetId: string,
      requestId: string,
      rawInput: unknown,
    ): Promise<InventoryResult<InventoryProvisioningResult>> {
      let input: InventoryProvisioningInput;
      try {
        if (
          !provisioningIdentifierSchema.safeParse(targetId).success ||
          !provisioningIdentifierSchema.safeParse(requestId).success
        )
          fail("invalid_request");
        input = parseInput(operation, rawInput);
      } catch (error) {
        return {
          ok: false,
          code:
            error instanceof ProvisioningFailure
              ? error.code
              : "invalid_request",
        };
      }
      const namespaceId = namespace(context, operation, requestId);
      const expectedHash = payloadHash(operation, targetId, input);
      try {
        return await store.runTransaction(async (transaction) => {
          if (!(await transaction.revalidateActor(context, operation)))
            fail("forbidden");
          const existingRequest = await transaction.getRequest(namespaceId);
          if (existingRequest !== null) {
            const marker =
              existingRequest as Partial<InventoryProvisioningRequestRecord>;
            if (
              marker.schemaVersion !== 1 ||
              marker.namespaceId !== namespaceId ||
              marker.actorUid !== context.uid ||
              marker.tenantId !== context.tenantId ||
              marker.operation !== operation ||
              marker.requestId !== requestId ||
              marker.targetId !== targetId ||
              marker.payloadHash !== expectedHash
            )
              fail("conflict");
            return {
              ok: true as const,
              value: { targetId, duplicate: true },
            };
          }

          const prepared = await prepareRecord(
            transaction,
            context,
            operation,
            targetId,
            input,
          );
          const timestamp = now().toISOString();
          const audit: InventoryProvisioningAuditRecord = {
            schemaVersion: 1,
            eventId: id(),
            actorUid: context.uid,
            action: operation,
            targetType: auditTarget[operation],
            targetId,
            requestId,
            tenantId: context.tenantId,
            facilityId: context.activeFacilityId,
            timestamp,
            metadata: { status: prepared.value.status },
          };
          const marker: InventoryProvisioningRequestRecord = {
            schemaVersion: 1,
            namespaceId,
            actorUid: context.uid,
            tenantId: context.tenantId,
            operation,
            requestId,
            targetId,
            payloadHash: expectedHash,
            createdAt: timestamp,
          };
          if (prepared.kind === "item") transaction.setItem(prepared.value);
          else if (prepared.kind === "location")
            transaction.setLocation(prepared.value);
          else if (prepared.kind === "lot") transaction.setLot(prepared.value);
          else transaction.setConfiguration(prepared.value);
          transaction.createAudit(audit);
          transaction.createRequest(marker);
          return {
            ok: true as const,
            value: { targetId, duplicate: false },
          };
        });
      } catch (error) {
        return {
          ok: false,
          code:
            error instanceof ProvisioningFailure
              ? error.code
              : "provider_unavailable",
        };
      }
    },
  };
}

export type InventoryProvisioningService = ReturnType<
  typeof createInventoryProvisioningService
>;
