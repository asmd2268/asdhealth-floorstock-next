import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import type { InventoryActorContext } from "@/domain/inventory/types";

import { createInventoryQueryRepository } from "./repository";

const context = {
  tenantId: "tenant-1",
  activeFacilityId: "facility-1",
} as InventoryActorContext;

const item = (number: number, tenantId = "tenant-1") => ({
  id: `item-${number.toString().padStart(2, "0")}`,
  data: {
    schemaVersion: 1,
    itemId: `item-${number.toString().padStart(2, "0")}`,
    tenantId,
    itemCode: `ITEM-${number}`,
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
  },
});

function firestoreWith(
  records: Record<string, readonly { id: string; data: unknown }[]>,
  ignoreFilters = false,
) {
  const cursors: Record<string, string | undefined> = {};
  return {
    cursors,
    firestore: {
      collection(name: string) {
        const state: {
          filters: [string, string][];
          cursor?: string;
          maximum?: number;
        } = { filters: [] };
        const query = {
          where(field: string, _operator: string, value: string) {
            state.filters.push([field, value]);
            return query;
          },
          orderBy() {
            return query;
          },
          startAfter(cursor: string) {
            state.cursor = cursor;
            cursors[name] = cursor;
            return query;
          },
          limit(maximum: number) {
            state.maximum = maximum;
            return query;
          },
          async get() {
            let values = [...(records[name] ?? [])];
            if (!ignoreFilters)
              values = values.filter((record) =>
                state.filters.every(
                  ([field, value]) =>
                    (record.data as Record<string, unknown>)[field] === value,
                ),
              );
            if (state.cursor)
              values = values.filter((record) => record.id > state.cursor!);
            values = values.slice(0, state.maximum);
            return {
              size: values.length,
              docs: values.map((record) => ({
                id: record.id,
                data: () => record.data,
              })),
            };
          },
        };
        return query;
      },
    } as unknown as Firestore,
  };
}

describe("bounded inventory repository", () => {
  it("returns only 25 validated records with an overflow cursor", async () => {
    const fake = firestoreWith({
      inventoryItems: Array.from({ length: 26 }, (_, index) => item(index + 1)),
    });
    const result = await createInventoryQueryRepository(fake.firestore).load(
      context,
    );
    expect(result.items.items).toHaveLength(25);
    expect(result.items.nextCursor).toBe("item-25");
  });

  it("uses independent canonical cursors for every directory", async () => {
    const fake = firestoreWith({});
    await createInventoryQueryRepository(fake.firestore).load(context, {
      items: "item-10",
      balances: "balance-10",
    });
    expect(fake.cursors.inventoryItems).toBe("item-10");
    expect(fake.cursors.inventoryBalances).toBe("balance-10");
    expect(fake.cursors.inventoryLocations).toBeUndefined();
    await expect(
      createInventoryQueryRepository(fake.firestore).load(context, {
        items: "../tenant-other",
      }),
    ).rejects.toThrow();
  });

  it("fails closed if a malicious reader returns a cross-tenant record", async () => {
    const fake = firestoreWith({ inventoryItems: [item(1, "tenant-2")] }, true);
    await expect(
      createInventoryQueryRepository(fake.firestore).load(context),
    ).rejects.toThrow("scope mismatch");
  });

  it("rejects a document ID that disagrees with its validated record", async () => {
    const record = item(1);
    const fake = firestoreWith({
      inventoryItems: [{ ...record, id: "other-id" }],
    });
    await expect(
      createInventoryQueryRepository(fake.firestore).load(context),
    ).rejects.toThrow("identity mismatch");
  });
});
