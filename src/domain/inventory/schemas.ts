import { z } from "zod";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  inventoryLocationKinds,
  inventoryOperations,
  inventoryTransactionTypes,
  inventoryUnits,
} from "./types";

export const INVENTORY_MAX_LINES = 100;
export const INVENTORY_MAX_LINE_QUANTITY = 1_000_000_000;
export const INVENTORY_MAX_BALANCE_QUANTITY = 9_000_000_000_000;
export const INVENTORY_MAX_LOCATION_DEPTH = 8;
export const INVENTORY_READ_LIMIT = 51;
export const INVENTORY_PAGE_SIZE = 25;

const safeText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim() && !/\p{C}/u.test(value));

export const inventoryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });

export const inventoryTimestampSchema = z.iso.datetime({ offset: true });
export const inventoryUnitSchema = z.enum(inventoryUnits);
export const inventoryQuantitySchema = z
  .number()
  .int()
  .positive()
  .max(INVENTORY_MAX_LINE_QUANTITY);

const unitConversionSchema = z
  .object({
    fromUnit: inventoryUnitSchema,
    toBaseUnitMultiplier: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const medicationItemSchema = z
  .object({
    schemaVersion: z.literal(1),
    itemId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    itemCode: provisioningIdentifierSchema,
    genericName: safeText(160),
    brandName: safeText(160).optional(),
    dosageForm: safeText(80),
    strength: safeText(80),
    baseUnit: inventoryUnitSchema,
    dispensingUnit: inventoryUnitSchema,
    unitConversions: z.array(unitConversionSchema).max(10),
    status: z.enum(["active", "inactive"]),
    lotControlled: z.boolean(),
    expiryControlled: z.boolean(),
    negativeStockAllowed: z.boolean(),
    barcodeIds: z.array(provisioningIdentifierSchema).max(20),
    externalReference: provisioningIdentifierSchema.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.expiryControlled && !item.lotControlled) {
      context.addIssue({
        code: "custom",
        path: ["expiryControlled"],
        message: "Expiry-controlled inventory must also be lot-controlled.",
      });
    }
    if (new Set(item.barcodeIds).size !== item.barcodeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["barcodeIds"],
        message: "Barcode identifiers must be unique.",
      });
    }
    const conversionUnits = item.unitConversions.map((entry) => entry.fromUnit);
    if (new Set(conversionUnits).size !== conversionUnits.length) {
      context.addIssue({
        code: "custom",
        path: ["unitConversions"],
        message: "Conversion source units must be unique.",
      });
    }
    if (
      item.unitConversions.some((entry) => entry.fromUnit === item.baseUnit)
    ) {
      context.addIssue({
        code: "custom",
        path: ["unitConversions"],
        message: "The base unit must not have a conversion entry.",
      });
    }
    if (
      item.dispensingUnit !== item.baseUnit &&
      !item.unitConversions.some(
        (entry) => entry.fromUnit === item.dispensingUnit,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["dispensingUnit"],
        message: "The dispensing unit requires an exact integer conversion.",
      });
    }
  });

export const inventoryLocationSchema = z
  .object({
    schemaVersion: z.literal(1),
    locationId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    platformId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    departmentId: provisioningIdentifierSchema.nullable(),
    parentLocationId: provisioningIdentifierSchema.nullable(),
    kind: z.enum(inventoryLocationKinds),
    displayName: safeText(120),
    status: z.enum(["active", "inactive"]),
  })
  .strict()
  .superRefine((location, context) => {
    const requiresDepartment = [
      "floor_stock",
      "ward",
      "clinic",
      "emergency_unit",
    ].includes(location.kind);
    if (requiresDepartment && !location.departmentId) {
      context.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "This location kind requires a department.",
      });
    }
    if (location.parentLocationId === location.locationId) {
      context.addIssue({
        code: "custom",
        path: ["parentLocationId"],
        message: "A location cannot be its own parent.",
      });
    }
  });

export const inventoryLotSchema = z
  .object({
    schemaVersion: z.literal(1),
    lotId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    itemId: provisioningIdentifierSchema,
    lotNumber: provisioningIdentifierSchema,
    expiryDate: inventoryDateSchema,
    status: z.enum(["active", "inactive"]),
  })
  .strict();

export const floorStockConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    configurationId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    departmentId: provisioningIdentifierSchema,
    locationId: provisioningIdentifierSchema,
    itemId: provisioningIdentifierSchema,
    unit: inventoryUnitSchema,
    minimumQuantity: z
      .number()
      .int()
      .nonnegative()
      .max(INVENTORY_MAX_BALANCE_QUANTITY),
    maximumQuantity: z
      .number()
      .int()
      .positive()
      .max(INVENTORY_MAX_BALANCE_QUANTITY),
    reorderThreshold: z
      .number()
      .int()
      .nonnegative()
      .max(INVENTORY_MAX_BALANCE_QUANTITY),
    status: z.enum(["active", "inactive"]),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (
      configuration.minimumQuantity > configuration.reorderThreshold ||
      configuration.reorderThreshold > configuration.maximumQuantity
    ) {
      context.addIssue({
        code: "custom",
        path: ["reorderThreshold"],
        message: "Expected minimum <= reorder threshold <= maximum.",
      });
    }
  });

export const inventoryBalanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    balanceId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    departmentId: provisioningIdentifierSchema.nullable(),
    locationId: provisioningIdentifierSchema,
    itemId: provisioningIdentifierSchema,
    lotId: provisioningIdentifierSchema.nullable(),
    expiryDate: inventoryDateSchema.nullable(),
    unit: inventoryUnitSchema,
    quantity: z
      .number()
      .int()
      .min(-INVENTORY_MAX_BALANCE_QUANTITY)
      .max(INVENTORY_MAX_BALANCE_QUANTITY),
    version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    updatedAt: inventoryTimestampSchema,
    lastTransactionId: provisioningIdentifierSchema,
  })
  .strict();

export const inventoryTransactionSchema = z
  .object({
    schemaVersion: z.literal(1),
    transactionId: provisioningIdentifierSchema,
    type: z.enum(inventoryTransactionTypes),
    status: z.literal("posted"),
    actorUid: provisioningIdentifierSchema,
    requestId: provisioningIdentifierSchema,
    tenantId: provisioningIdentifierSchema,
    platformId: provisioningIdentifierSchema,
    organizationId: provisioningIdentifierSchema,
    facilityId: provisioningIdentifierSchema,
    sourceDepartmentId: provisioningIdentifierSchema.nullable(),
    destinationDepartmentId: provisioningIdentifierSchema.nullable(),
    sourceLocationId: provisioningIdentifierSchema.nullable(),
    destinationLocationId: provisioningIdentifierSchema.nullable(),
    reasonCode: provisioningIdentifierSchema.nullable(),
    lineCount: z.number().int().positive().max(INVENTORY_MAX_LINES),
    postedAt: inventoryTimestampSchema,
    metadata: z
      .record(
        z.string(),
        z.union([
          z.string().max(128),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .refine((value) => Object.keys(value).length <= 20),
  })
  .strict();

export const inventoryTransactionLineSchema = z
  .object({
    schemaVersion: z.literal(1),
    lineId: provisioningIdentifierSchema,
    transactionId: provisioningIdentifierSchema,
    lineNumber: z.number().int().positive().max(INVENTORY_MAX_LINES),
    itemId: provisioningIdentifierSchema,
    lotId: provisioningIdentifierSchema.nullable(),
    expiryDate: inventoryDateSchema.nullable(),
    enteredUnit: inventoryUnitSchema,
    enteredQuantity: inventoryQuantitySchema,
    baseUnit: inventoryUnitSchema,
    baseQuantity: z
      .number()
      .int()
      .positive()
      .max(INVENTORY_MAX_BALANCE_QUANTITY),
  })
  .strict();

export const inventoryPostingLineSchema = z
  .object({
    itemId: provisioningIdentifierSchema,
    lotId: provisioningIdentifierSchema.optional(),
    expiryDate: inventoryDateSchema.optional(),
    unit: inventoryUnitSchema,
    quantity: inventoryQuantitySchema,
  })
  .strict();

const inventoryLinesSchema = z
  .array(inventoryPostingLineSchema)
  .min(1)
  .max(INVENTORY_MAX_LINES);

export const receiveInventorySchema = z
  .object({
    destinationLocationId: provisioningIdentifierSchema,
    lines: inventoryLinesSchema,
  })
  .strict();

export const issueInventorySchema = z
  .object({
    sourceLocationId: provisioningIdentifierSchema,
    lines: inventoryLinesSchema,
  })
  .strict();

export const adjustInventorySchema = z
  .object({
    locationId: provisioningIdentifierSchema,
    reasonCode: provisioningIdentifierSchema,
    lines: inventoryLinesSchema,
  })
  .strict();

export const transferInventorySchema = z
  .object({
    sourceLocationId: provisioningIdentifierSchema,
    destinationLocationId: provisioningIdentifierSchema,
    lines: inventoryLinesSchema,
  })
  .strict()
  .refine((value) => value.sourceLocationId !== value.destinationLocationId, {
    path: ["destinationLocationId"],
    message: "Source and destination locations must differ.",
  });

export const inventoryOperationSchema = z.enum(inventoryOperations);

export function isExpiredDateOnly(expiryDate: string, now: Date): boolean {
  const today = `${now.getUTCFullYear().toString().padStart(4, "0")}-${(
    now.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${now.getUTCDate().toString().padStart(2, "0")}`;
  return expiryDate < today;
}
