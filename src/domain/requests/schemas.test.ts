import { describe, expect, it } from "vitest";

import {
  createFloorStockRequestSchema,
  emptyFloorStockRequestBodySchema,
  floorStockRequestLineRecordSchema,
  floorStockRequestRecordSchema,
} from "./schemas";

describe("floor-stock request boundary schemas", () => {
  it("accepts safe-integer configured quantities and rejects fractions", () => {
    const input = {
      note: "Ward request",
      lines: [{ configurationId: "configuration-1", quantity: 10 }],
    };
    expect(createFloorStockRequestSchema.safeParse(input).success).toBe(true);
    expect(
      createFloorStockRequestSchema.safeParse({
        ...input,
        lines: [{ configurationId: "configuration-1", quantity: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate configurations, untrimmed notes, and unknown fields", () => {
    expect(
      createFloorStockRequestSchema.safeParse({
        note: " untrimmed ",
        lines: [
          { configurationId: "configuration-1", quantity: 1 },
          { configurationId: "configuration-1", quantity: 2 },
        ],
        tenantId: "attacker",
      }).success,
    ).toBe(false);
    expect(
      emptyFloorStockRequestBodySchema.safeParse({ status: "approved" })
        .success,
    ).toBe(false);
  });

  it("requires immutable line identity and positive approved quantities", () => {
    const line = {
      schemaVersion: 1,
      lineId: "line-1",
      floorStockRequestId: "request-1",
      lineNumber: 1,
      configurationId: "configuration-1",
      itemId: "item-1",
      locationId: "location-1",
      unit: "tablet",
      requestedQuantity: 1,
      approvedQuantity: 0,
      fulfilledQuantity: null,
    };
    expect(floorStockRequestLineRecordSchema.safeParse(line).success).toBe(
      false,
    );
  });

  it("rejects lifecycle states whose timestamps contradict their status", () => {
    const request = {
      schemaVersion: 1,
      floorStockRequestId: "request-1",
      tenantId: "tenant-1",
      platformId: "platform-1",
      organizationId: "organization-1",
      facilityId: "facility-1",
      departmentId: "department-1",
      status: "approved",
      requestedByUid: "user-1",
      lastActorUid: "user-2",
      lineCount: 1,
      note: null,
      version: 3,
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-02T00:00:00.000Z",
      submittedAt: "2028-01-02T00:00:00.000Z",
      approvedAt: null,
      rejectedAt: null,
      fulfillmentStartedAt: null,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
    };
    expect(floorStockRequestRecordSchema.safeParse(request).success).toBe(
      false,
    );
    expect(
      floorStockRequestRecordSchema.safeParse({
        ...request,
        status: "draft",
        submittedAt: "2028-01-02T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
