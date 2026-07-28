import { describe, expect, it } from "vitest";

import {
  INVENTORY_MAX_LINES,
  floorStockConfigurationSchema,
  inventoryDateSchema,
  inventoryLocationSchema,
  medicationItemSchema,
  receiveInventorySchema,
  transferInventorySchema,
} from "./schemas";

const item = {
  schemaVersion: 1,
  itemId: "item-1",
  tenantId: "tenant-1",
  itemCode: "PARA-500",
  genericName: "Paracetamol",
  dosageForm: "Tablet",
  strength: "500 mg",
  baseUnit: "tablet",
  dispensingUnit: "box",
  unitConversions: [{ fromUnit: "box", toBaseUnitMultiplier: 20 }],
  status: "active",
  lotControlled: true,
  expiryControlled: true,
  negativeStockAllowed: false,
  barcodeIds: ["628100000001"],
} as const;

describe("inventory boundary schemas", () => {
  it("accepts only real date-only expiry values", () => {
    expect(inventoryDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(inventoryDateSchema.safeParse("2027-02-29").success).toBe(false);
    expect(inventoryDateSchema.safeParse("2028-02-29T00:00:00Z").success).toBe(
      false,
    );
  });

  it("requires lot control whenever expiry is controlled", () => {
    expect(medicationItemSchema.safeParse(item).success).toBe(true);
    expect(
      medicationItemSchema.safeParse({ ...item, lotControlled: false }).success,
    ).toBe(false);
  });

  it("rejects fractional conversions and duplicate semantic units", () => {
    expect(
      medicationItemSchema.safeParse({
        ...item,
        unitConversions: [
          { fromUnit: "box", toBaseUnitMultiplier: 1.5 },
          { fromUnit: "box", toBaseUnitMultiplier: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires department scope for patient-care locations", () => {
    expect(
      inventoryLocationSchema.safeParse({
        schemaVersion: 1,
        locationId: "ward-a",
        tenantId: "tenant-1",
        platformId: "platform-1",
        organizationId: "org-1",
        facilityId: "facility-1",
        departmentId: null,
        parentLocationId: null,
        kind: "ward",
        displayName: "Ward A",
        status: "active",
      }).success,
    ).toBe(false);
  });

  it("bounds posting line counts and quantities", () => {
    const line = { itemId: "item-1", unit: "tablet", quantity: 1 };
    expect(
      receiveInventorySchema.safeParse({
        destinationLocationId: "pharmacy",
        lines: Array.from({ length: INVENTORY_MAX_LINES + 1 }, () => line),
      }).success,
    ).toBe(false);
    expect(
      receiveInventorySchema.safeParse({
        destinationLocationId: "pharmacy",
        lines: [{ ...line, quantity: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a transfer to the same location", () => {
    expect(
      transferInventorySchema.safeParse({
        sourceLocationId: "pharmacy",
        destinationLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it("validates exact ordered floor-stock thresholds", () => {
    const configuration = {
      schemaVersion: 1,
      configurationId: "config-1",
      tenantId: "tenant-1",
      organizationId: "org-1",
      facilityId: "facility-1",
      departmentId: "dept-1",
      locationId: "ward-a",
      itemId: "item-1",
      unit: "tablet",
      minimumQuantity: 10,
      reorderThreshold: 20,
      maximumQuantity: 50,
      status: "active",
    };
    expect(floorStockConfigurationSchema.safeParse(configuration).success).toBe(
      true,
    );
    expect(
      floorStockConfigurationSchema.safeParse({
        ...configuration,
        reorderThreshold: 51,
      }).success,
    ).toBe(false);
    expect(
      floorStockConfigurationSchema.safeParse({
        ...configuration,
        minimumQuantity: 0.5,
      }).success,
    ).toBe(false);
  });
});
