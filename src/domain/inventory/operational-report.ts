import type { InventoryReplenishmentRecommendation } from "./replenishment";

export interface InventoryOperationalSummary {
  configurationCount: number;
  belowReorderCount: number;
  recommendedUnitCount: number;
}

export function summarizeInventoryOperations(
  recommendations: readonly InventoryReplenishmentRecommendation[],
): InventoryOperationalSummary {
  return {
    configurationCount: recommendations.length,
    belowReorderCount: recommendations.filter(
      (recommendation) => recommendation.status === "below_reorder",
    ).length,
    recommendedUnitCount: recommendations.reduce(
      (total, recommendation) => total + recommendation.recommendedQuantity,
      0,
    ),
  };
}
