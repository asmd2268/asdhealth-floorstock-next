import { describe, expect, it } from "vitest";
import { summarizeInventoryOperations } from "./operational-report";

describe("summarizeInventoryOperations", () => {
  it("summarizes bounded replenishment recommendations", () => {
    expect(
      summarizeInventoryOperations([
        {
          configurationId: "a",
          itemId: "i",
          locationId: "l",
          unit: "box",
          currentQuantity: 1,
          reorderThreshold: 3,
          maximumQuantity: 5,
          recommendedQuantity: 4,
          status: "below_reorder",
        },
        {
          configurationId: "b",
          itemId: "i2",
          locationId: "l2",
          unit: "each",
          currentQuantity: 5,
          reorderThreshold: 3,
          maximumQuantity: 5,
          recommendedQuantity: 0,
          status: "adequate",
        },
      ]),
    ).toEqual({
      configurationCount: 2,
      belowReorderCount: 1,
      recommendedUnitCount: 4,
    });
  });
});
