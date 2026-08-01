import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { FloorStockRequestReadContext } from "./repository";
import { createFloorStockRequestRepository } from "./repository";

const context = {
  tenantId: "tenant-1",
  activeFacilityId: "facility-1",
  activeDepartmentId: "department-1",
  departmentOnly: true,
} as FloorStockRequestReadContext;

function record(number: number, overrides: Record<string, unknown> = {}) {
  const id = `request-${number.toString().padStart(2, "0")}`;
  return {
    id,
    data: {
      schemaVersion: 1,
      floorStockRequestId: id,
      tenantId: "tenant-1",
      platformId: "platform-1",
      organizationId: "organization-1",
      facilityId: "facility-1",
      departmentId: "department-1",
      status: "draft",
      requestedByUid: "user-1",
      lastActorUid: "user-1",
      lineCount: 1,
      note: null,
      version: 1,
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-01T00:00:00.000Z",
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      fulfillmentStartedAt: null,
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      ...overrides,
    },
  };
}

function fakeFirestore(
  source: readonly ReturnType<typeof record>[],
  ignoreFilters = false,
) {
  let capturedCursor: string | null = null;
  return {
    get cursor() {
      return capturedCursor;
    },
    firestore: {
      collection() {
        const filters: Array<[string, string]> = [];
        let cursor: string | null = null;
        let maximum = 100;
        const query = {
          where(field: string, _operator: string, value: string) {
            filters.push([field, value]);
            return query;
          },
          orderBy() {
            return query;
          },
          startAfter(value: string) {
            cursor = value;
            capturedCursor = value;
            return query;
          },
          limit(value: number) {
            maximum = value;
            return query;
          },
          async get() {
            let values = [...source];
            if (!ignoreFilters)
              values = values.filter((entry) =>
                filters.every(
                  ([field, value]) =>
                    (entry.data as Record<string, unknown>)[field] === value,
                ),
              );
            if (cursor) values = values.filter((entry) => entry.id > cursor!);
            values = values.slice(0, maximum);
            return {
              size: values.length,
              docs: values.map((entry) => ({
                id: entry.id,
                data: () => entry.data,
              })),
            };
          },
        };
        return query;
      },
    } as unknown as Firestore,
  };
}

describe("bounded floor-stock request repository", () => {
  it("returns 25 validated department records and an overflow cursor", async () => {
    const fake = fakeFirestore(
      Array.from({ length: 26 }, (_, index) => record(index + 1)),
    );
    const result = await createFloorStockRequestRepository(fake.firestore).list(
      context,
    );
    expect(result.items).toHaveLength(25);
    expect(result.nextCursor).toBe("request-25");
  });

  it("accepts only canonical independent document cursors", async () => {
    const fake = fakeFirestore([]);
    await createFloorStockRequestRepository(fake.firestore).list(
      context,
      "request-10",
    );
    expect(fake.cursor).toBe("request-10");
    await expect(
      createFloorStockRequestRepository(fake.firestore).list(
        context,
        "../tenant-2",
      ),
    ).rejects.toThrow();
  });

  it("fails closed for malicious cross-department and identity-mismatched results", async () => {
    const crossDepartment = fakeFirestore(
      [record(1, { departmentId: "department-2" })],
      true,
    );
    await expect(
      createFloorStockRequestRepository(crossDepartment.firestore).list(
        context,
      ),
    ).rejects.toThrow("scope mismatch");

    const mismatched = record(1);
    mismatched.id = "request-other";
    await expect(
      createFloorStockRequestRepository(
        fakeFirestore([mismatched]).firestore,
      ).list(context),
    ).rejects.toThrow("scope mismatch");
  });
});
