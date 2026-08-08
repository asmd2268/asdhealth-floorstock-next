import { inventoryConversionMultiplier } from "./balances";
import type {
  FloorStockConfigurationRecord,
  InventoryBalanceRecord,
  InventoryUnit,
  MedicationItemRecord,
} from "./types";

export interface InventoryReplenishmentRecommendation {
  configurationId: string;
  itemId: string;
  locationId: string;
  unit: InventoryUnit;
  currentQuantity: number;
  reorderThreshold: number;
  maximumQuantity: number;
  recommendedQuantity: number;
  status: "below_reorder" | "adequate";
}

export function calculateReplenishmentRecommendation(
  configuration: FloorStockConfigurationRecord,
  item: MedicationItemRecord,
  balances: readonly InventoryBalanceRecord[],
): InventoryReplenishmentRecommendation {
  const multiplier = inventoryConversionMultiplier(item, configuration.unit);
  if (!multiplier || !Number.isSafeInteger(multiplier))
    throw new Error("Unsafe floor-stock unit conversion");
  const baseQuantity = balances
    .filter(
      (balance) =>
        balance.tenantId === configuration.tenantId &&
        balance.facilityId === configuration.facilityId &&
        balance.departmentId === configuration.departmentId &&
        balance.locationId === configuration.locationId &&
        balance.itemId === configuration.itemId &&
        balance.unit === item.baseUnit,
    )
    .reduce((total, balance) => total + balance.quantity, 0);
  const currentQuantity = Math.floor(baseQuantity / multiplier);
  const below = currentQuantity < configuration.reorderThreshold;
  return {
    configurationId: configuration.configurationId,
    itemId: configuration.itemId,
    locationId: configuration.locationId,
    unit: configuration.unit,
    currentQuantity,
    reorderThreshold: configuration.reorderThreshold,
    maximumQuantity: configuration.maximumQuantity,
    recommendedQuantity: below
      ? configuration.maximumQuantity - currentQuantity
      : 0,
    status: below ? "below_reorder" : "adequate",
  };
}
