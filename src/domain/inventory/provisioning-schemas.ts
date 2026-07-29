import { z } from "zod";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";

import {
  INVENTORY_MAX_BALANCE_QUANTITY,
  inventoryDateSchema,
  inventoryUnitSchema,
} from "./schemas";
import { inventoryLocationKinds } from "./types";

const safeText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim() && !/\p{C}/u.test(value));

const unitConversionSchema = z
  .object({
    fromUnit: inventoryUnitSchema,
    toBaseUnitMultiplier: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const medicationItemProvisioningSchema = z
  .object({
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
  .strict();

export const inventoryLocationProvisioningSchema = z
  .object({
    departmentId: provisioningIdentifierSchema.nullable(),
    parentLocationId: provisioningIdentifierSchema.nullable(),
    kind: z.enum(inventoryLocationKinds),
    displayName: safeText(120),
    status: z.enum(["active", "inactive"]),
  })
  .strict();

export const inventoryLotProvisioningSchema = z
  .object({
    itemId: provisioningIdentifierSchema,
    lotNumber: provisioningIdentifierSchema,
    expiryDate: inventoryDateSchema,
    status: z.enum(["active", "inactive"]),
  })
  .strict();

export const floorStockConfigurationProvisioningSchema = z
  .object({
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
  .strict();
