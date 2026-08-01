import { createHash } from "node:crypto";

import type {
  InventoryBalanceIdentity,
  InventoryUnit,
  MedicationItemRecord,
} from "./types";

export function inventoryBalanceId(identity: InventoryBalanceIdentity): string {
  return createHash("sha256")
    .update("asdhealth:inventory-balance:v1\0", "utf8")
    .update(JSON.stringify(identity), "utf8")
    .digest("hex");
}

export function inventoryConversionMultiplier(
  item: MedicationItemRecord,
  unit: InventoryUnit,
): number | null {
  if (unit === item.baseUnit) return 1;
  return (
    item.unitConversions.find((candidate) => candidate.fromUnit === unit)
      ?.toBaseUnitMultiplier ?? null
  );
}
