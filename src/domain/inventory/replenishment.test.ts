import { describe, expect, it } from "vitest";
import { calculateReplenishmentRecommendation } from "./replenishment";
import type {
  FloorStockConfigurationRecord,
  InventoryBalanceRecord,
  MedicationItemRecord,
} from "./types";

const item: MedicationItemRecord = {
  schemaVersion: 1,
  itemId: "item-1",
  tenantId: "tenant-1",
  itemCode: "AMOX",
  genericName: "Amoxicillin",
  dosageForm: "tablet",
  strength: "500mg",
  baseUnit: "tablet",
  dispensingUnit: "box",
  unitConversions: [{ fromUnit: "box", toBaseUnitMultiplier: 10 }],
  status: "active",
  lotControlled: false,
  expiryControlled: false,
  negativeStockAllowed: false,
  barcodeIds: [],
};
const config: FloorStockConfigurationRecord = {
  schemaVersion: 1,
  configurationId: "cfg-1",
  tenantId: "tenant-1",
  organizationId: "org-1",
  facilityId: "fac-1",
  departmentId: "dept-1",
  locationId: "loc-1",
  itemId: "item-1",
  unit: "box",
  minimumQuantity: 1,
  reorderThreshold: 3,
  maximumQuantity: 6,
  status: "active",
};
const balance = (
  quantity: number,
  departmentId = "dept-1",
): InventoryBalanceRecord => ({
  schemaVersion: 1,
  balanceId: `bal-${quantity}`,
  tenantId: "tenant-1",
  facilityId: "fac-1",
  departmentId,
  locationId: "loc-1",
  itemId: "item-1",
  lotId: null,
  expiryDate: null,
  unit: "tablet",
  quantity,
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastTransactionId: "tx-1",
});

describe("calculateReplenishmentRecommendation", () => {
  it("recommends up to maximum when below reorder", () => {
    expect(
      calculateReplenishmentRecommendation(config, item, [balance(20)]),
    ).toMatchObject({
      currentQuantity: 2,
      recommendedQuantity: 4,
      status: "below_reorder",
    });
  });
  it("reports adequate stock and ignores other departments", () => {
    expect(
      calculateReplenishmentRecommendation(config, item, [
        balance(30),
        balance(100, "other"),
      ]),
    ).toMatchObject({
      currentQuantity: 3,
      recommendedQuantity: 0,
      status: "adequate",
    });
  });
  it("fails closed for unsafe conversions", () => {
    expect(() =>
      calculateReplenishmentRecommendation(
        { ...config, unit: "vial" },
        item,
        [],
      ),
    ).toThrow("Unsafe");
  });
});
