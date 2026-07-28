import { describe, expect, it } from "vitest";

import { validateMedicationCatalogMutation } from "./catalog";
import type { MedicationItemRecord } from "./types";

const item: MedicationItemRecord = {
  schemaVersion: 1,
  itemId: "item-1",
  tenantId: "tenant-1",
  itemCode: "ITEM-001",
  genericName: "Medicine",
  dosageForm: "Tablet",
  strength: "10 mg",
  baseUnit: "tablet",
  dispensingUnit: "tablet",
  unitConversions: [],
  status: "active",
  lotControlled: false,
  expiryControlled: false,
  negativeStockAllowed: false,
  barcodeIds: [],
};

describe("medication catalog policy", () => {
  it("rejects duplicate item codes within a tenant", () => {
    expect(
      validateMedicationCatalogMutation({
        candidate: { ...item, itemId: "item-2" },
        existing: null,
        tenantItems: [item],
        hasInventoryActivity: false,
      }),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("allows the same item code in a different tenant", () => {
    const candidate = { ...item, itemId: "item-2", tenantId: "tenant-2" };
    expect(
      validateMedicationCatalogMutation({
        candidate,
        existing: null,
        tenantItems: [item],
        hasInventoryActivity: false,
      }),
    ).toEqual({ ok: true, value: candidate });
  });

  it("freezes identity and stock-control fields after activity", () => {
    for (const candidate of [
      { ...item, itemCode: "ITEM-NEW" },
      {
        ...item,
        baseUnit: "box" as const,
        dispensingUnit: "box" as const,
      },
      { ...item, lotControlled: true },
    ]) {
      expect(
        validateMedicationCatalogMutation({
          candidate,
          existing: item,
          tenantItems: [item],
          hasInventoryActivity: true,
        }),
      ).toEqual({ ok: false, code: "conflict" });
    }
  });

  it("allows descriptive changes without changing inventory identity", () => {
    const candidate = { ...item, genericName: "Updated medicine" };
    expect(
      validateMedicationCatalogMutation({
        candidate,
        existing: item,
        tenantItems: [item],
        hasInventoryActivity: true,
      }),
    ).toEqual({ ok: true, value: candidate });
  });
});
