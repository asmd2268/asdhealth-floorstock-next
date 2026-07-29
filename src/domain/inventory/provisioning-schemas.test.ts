import { describe, expect, it } from "vitest";

import {
  floorStockConfigurationProvisioningSchema,
  inventoryLocationProvisioningSchema,
  medicationItemProvisioningSchema,
} from "./provisioning-schemas";

describe("inventory provisioning boundary schemas", () => {
  it("rejects trusted scope fields from catalog payloads", () => {
    const base = {
      itemCode: "ITEM-1",
      genericName: "Medicine",
      dosageForm: "Tablet",
      strength: "10 mg",
      baseUnit: "tablet",
      dispensingUnit: "tablet",
      unitConversions: [],
      status: "active",
      lotControlled: true,
      expiryControlled: true,
      negativeStockAllowed: false,
      barcodeIds: [],
    };
    expect(medicationItemProvisioningSchema.safeParse(base).success).toBe(true);
    expect(
      medicationItemProvisioningSchema.safeParse({
        ...base,
        tenantId: "tenant-other",
      }).success,
    ).toBe(false);
  });

  it("keeps location scope server-owned", () => {
    const base = {
      departmentId: "department-1",
      parentLocationId: null,
      kind: "floor_stock",
      displayName: "Ward stock",
      status: "active",
    };
    expect(inventoryLocationProvisioningSchema.safeParse(base).success).toBe(
      true,
    );
    expect(
      inventoryLocationProvisioningSchema.safeParse({
        ...base,
        facilityId: "facility-other",
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded integer threshold fields", () => {
    const base = {
      departmentId: "department-1",
      locationId: "location-1",
      itemId: "item-1",
      unit: "tablet",
      minimumQuantity: 10,
      reorderThreshold: 20,
      maximumQuantity: 30,
      status: "active",
    };
    expect(
      floorStockConfigurationProvisioningSchema.safeParse(base).success,
    ).toBe(true);
    expect(
      floorStockConfigurationProvisioningSchema.safeParse({
        ...base,
        reorderThreshold: 20.5,
      }).success,
    ).toBe(false);
  });
});
