import { describe, expect, it } from "vitest";

import type {
  InventoryStore,
  InventoryTransactionStore,
} from "@/domain/inventory/store";
import type {
  InventoryActorContext,
  InventoryOperation,
} from "@/domain/inventory/types";

import { createInventoryService } from "./service";

const context: InventoryActorContext = {
  uid: "user-1",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "org-1",
  activeFacilityId: "facility-1",
  activeScope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "org-1",
    facilityId: "facility-1",
  },
  roleAssignments: [
    {
      role: "pharmacy_manager",
      scope: {
        kind: "facility",
        platformId: "platform-1",
        organizationId: "org-1",
        facilityId: "facility-1",
      },
    },
  ],
  explicitPermissionOverrides: [],
  featureFlags: { inventory: true },
  trustedStateFingerprint: "a".repeat(64),
};

const item = {
  schemaVersion: 1,
  itemId: "item-1",
  tenantId: "tenant-1",
  itemCode: "ITEM-1",
  genericName: "Medicine",
  dosageForm: "Tablet",
  strength: "10 mg",
  baseUnit: "tablet",
  dispensingUnit: "box",
  unitConversions: [{ fromUnit: "box", toBaseUnitMultiplier: 10 }],
  status: "active",
  lotControlled: false,
  expiryControlled: false,
  negativeStockAllowed: false,
  barcodeIds: [],
};
const location = (locationId: string, departmentId: string | null = null) => ({
  schemaVersion: 1,
  locationId,
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "org-1",
  facilityId: "facility-1",
  departmentId,
  parentLocationId: null,
  kind: departmentId ? "ward" : "pharmacy",
  displayName: locationId,
  status: "active",
});

class MemoryStore implements InventoryStore {
  authorized = true;
  failAudit = false;
  items = new Map([["item-1", item]]);
  locations = new Map<string, unknown>([
    ["pharmacy", location("pharmacy")],
    ["ward-a", location("ward-a", "dept-a")],
  ]);
  lots = new Map<string, unknown>();
  balances = new Map<string, unknown>();
  requests = new Map<string, unknown>();
  transactions: unknown[] = [];
  lines: unknown[] = [];
  audits: unknown[] = [];
  operations: InventoryOperation[] = [];

  async runTransaction<T>(
    operation: (transaction: InventoryTransactionStore) => Promise<T>,
  ): Promise<T> {
    const balances = new Map(this.balances);
    const requests = new Map(this.requests);
    const transactions = [...this.transactions];
    const lines = [...this.lines];
    const audits = [...this.audits];
    const value = await operation({
      revalidateActor: async (_context, inventoryOperation) => {
        this.operations.push(inventoryOperation);
        return this.authorized;
      },
      getItem: async (id) => this.items.get(id) ?? null,
      getLocation: async (id) => this.locations.get(id) ?? null,
      getLot: async (id) => this.lots.get(id) ?? null,
      getBalance: async (id) => balances.get(id) ?? null,
      getRequest: async (id) => requests.get(id) ?? null,
      createTransaction: (record) => transactions.push(record),
      createLine: (record) => lines.push(record),
      setBalance: (record) => balances.set(record.balanceId, record),
      createAudit: (record) => {
        if (this.failAudit) throw new Error("audit unavailable");
        audits.push(record);
      },
      createRequest: (record) => requests.set(record.namespaceId, record),
    });
    this.balances = balances;
    this.requests = requests;
    this.transactions = transactions;
    this.lines = lines;
    this.audits = audits;
    return value;
  }
}

function service(store: MemoryStore) {
  let sequence = 0;
  return createInventoryService(store, {
    now: () => new Date("2027-01-10T10:00:00.000Z"),
    id: () =>
      `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}`,
  });
}

describe("inventory atomic posting", () => {
  it("converts exact integer quantities and materializes a balance", async () => {
    const store = new MemoryStore();
    const result = await service(store).post(context, "receive", "request-1", {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "box", quantity: 3 }],
    });
    expect(result).toMatchObject({ ok: true, value: { duplicate: false } });
    expect([...store.balances.values()]).toEqual([
      expect.objectContaining({ quantity: 30, unit: "tablet", version: 1 }),
    ]);
    expect(store.lines).toEqual([
      expect.objectContaining({ enteredQuantity: 3, baseQuantity: 30 }),
    ]);
    expect(store.transactions).toHaveLength(1);
    expect(store.audits).toEqual([
      expect.objectContaining({ metadata: { lineCount: 1 } }),
    ]);
  });

  it("returns the original transaction for an idempotent replay", async () => {
    const store = new MemoryStore();
    const api = service(store);
    const body = {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
    };
    const first = await api.post(context, "receive", "same-request", body);
    const second = await api.post(context, "receive", "same-request", body);
    expect(second).toEqual({
      ok: true,
      value: {
        transactionId: first.ok ? first.value.transactionId : "",
        duplicate: true,
      },
    });
    expect(store.transactions).toHaveLength(1);
  });

  it("namespaces the same request ID by actor, tenant, and operation", async () => {
    const store = new MemoryStore();
    store.items.set("item-2", {
      ...item,
      itemId: "item-2",
      tenantId: "tenant-2",
    });
    store.locations.set("pharmacy-2", {
      ...location("pharmacy-2"),
      tenantId: "tenant-2",
    });
    const api = service(store);
    const body = {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
    };
    expect(
      (await api.post(context, "receive", "shared-request", body)).ok,
    ).toBe(true);
    expect(
      (
        await api.post(
          { ...context, uid: "user-2" },
          "receive",
          "shared-request",
          body,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await api.post(context, "adjust_increase", "shared-request", {
          locationId: "pharmacy",
          reasonCode: "count-correction",
          lines: body.lines,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await api.post(
          { ...context, tenantId: "tenant-2" },
          "receive",
          "shared-request",
          {
            destinationLocationId: "pharmacy-2",
            lines: [{ ...body.lines[0], itemId: "item-2" }],
          },
        )
      ).ok,
    ).toBe(true);
    expect(store.transactions).toHaveLength(4);
  });

  it("revalidates authority before honoring an idempotency marker", async () => {
    const store = new MemoryStore();
    const api = service(store);
    const body = {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
    };
    await api.post(context, "receive", "request-1", body);
    store.authorized = false;
    expect(await api.post(context, "receive", "request-1", body)).toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const store = new MemoryStore();
    const api = service(store);
    await api.post(context, "receive", "request-1", {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
    });
    expect(
      await api.post(context, "receive", "request-1", {
        destinationLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 2 }],
      }),
    ).toEqual({ ok: false, code: "conflict" });
    expect(store.transactions).toHaveLength(1);
  });

  it("fails closed for cross-tenant and cross-facility locations", async () => {
    const store = new MemoryStore();
    store.locations.set("evil", {
      ...location("evil"),
      tenantId: "tenant-2",
      facilityId: "facility-2",
    });
    expect(
      await service(store).post(context, "receive", "request-1", {
        destinationLocationId: "evil",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(store.transactions).toHaveLength(0);
  });

  it("prevents negative balances and rolls back the ledger", async () => {
    const store = new MemoryStore();
    const result = await service(store).post(context, "issue", "request-1", {
      sourceLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
    });
    expect(result).toEqual({ ok: false, code: "insufficient_stock" });
    expect(store.transactions).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it("posts a valid issue after receipt", async () => {
    const store = new MemoryStore();
    const api = service(store);
    await api.post(context, "receive", "receipt", {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 5 }],
    });
    expect(
      await api.post(context, "issue", "issue", {
        sourceLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 2 }],
      }),
    ).toMatchObject({ ok: true });
    expect([...store.balances.values()]).toEqual([
      expect.objectContaining({ quantity: 3, version: 2 }),
    ]);
  });

  it("posts increase and decrease adjustments with a reason", async () => {
    const store = new MemoryStore();
    const api = service(store);
    expect(
      await api.post(context, "adjust_increase", "increase", {
        locationId: "pharmacy",
        reasonCode: "count-correction",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 5 }],
      }),
    ).toMatchObject({ ok: true });
    expect(
      await api.post(context, "adjust_decrease", "decrease", {
        locationId: "pharmacy",
        reasonCode: "damage",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 2 }],
      }),
    ).toMatchObject({ ok: true });
    expect([...store.balances.values()]).toEqual([
      expect.objectContaining({ quantity: 3, version: 2 }),
    ]);
  });

  it("permits a negative balance only under the trusted item policy", async () => {
    const store = new MemoryStore();
    store.items.set("item-1", { ...item, negativeStockAllowed: true });
    expect(
      await service(store).post(context, "issue", "request-1", {
        sourceLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 2 }],
      }),
    ).toMatchObject({ ok: true });
    expect([...store.balances.values()]).toEqual([
      expect.objectContaining({ quantity: -2 }),
    ]);
  });

  it("rejects inactive items without any partial write", async () => {
    const store = new MemoryStore();
    store.items.set("item-1", { ...item, status: "inactive" });
    expect(
      await service(store).post(context, "receive", "request-1", {
        destinationLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: "inactive_item" });
    expect(store.transactions).toHaveLength(0);
    expect(store.balances.size).toBe(0);
  });

  it("updates both sides of a transfer atomically", async () => {
    const store = new MemoryStore();
    const api = service(store);
    await api.post(context, "receive", "receipt", {
      destinationLocationId: "pharmacy",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 10 }],
    });
    const result = await api.post(context, "transfer", "transfer", {
      sourceLocationId: "pharmacy",
      destinationLocationId: "ward-a",
      lines: [{ itemId: "item-1", unit: "tablet", quantity: 4 }],
    });
    expect(result.ok).toBe(true);
    expect(
      [...store.balances.values()]
        .map((value) => (value as { quantity: number }).quantity)
        .sort(),
    ).toEqual([4, 6]);
  });

  it("rejects duplicate semantic balance lines", async () => {
    const store = new MemoryStore();
    const result = await service(store).post(context, "receive", "request-1", {
      destinationLocationId: "pharmacy",
      lines: [
        { itemId: "item-1", unit: "tablet", quantity: 1 },
        { itemId: "item-1", unit: "box", quantity: 1 },
      ],
    });
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(store.transactions).toHaveLength(0);
  });

  it("enforces lot identity and rejects expired stock", async () => {
    const store = new MemoryStore();
    store.items.set("item-1", {
      ...item,
      lotControlled: true,
      expiryControlled: true,
    });
    store.lots.set("lot-1", {
      schemaVersion: 1,
      lotId: "lot-1",
      tenantId: "tenant-1",
      facilityId: "facility-1",
      itemId: "item-1",
      lotNumber: "LOT-1",
      expiryDate: "2026-12-31",
      status: "active",
    });
    expect(
      await service(store).post(context, "receive", "request-1", {
        destinationLocationId: "pharmacy",
        lines: [
          {
            itemId: "item-1",
            lotId: "lot-1",
            expiryDate: "2026-12-31",
            unit: "tablet",
            quantity: 1,
          },
        ],
      }),
    ).toEqual({ ok: false, code: "expired_lot" });
  });

  it("captures a lot date without applying expiry policy when disabled", async () => {
    const store = new MemoryStore();
    store.items.set("item-1", {
      ...item,
      lotControlled: true,
      expiryControlled: false,
    });
    store.lots.set("lot-1", {
      schemaVersion: 1,
      lotId: "lot-1",
      tenantId: "tenant-1",
      facilityId: "facility-1",
      itemId: "item-1",
      lotNumber: "LOT-1",
      expiryDate: "2026-12-31",
      status: "active",
    });
    const result = await service(store).post(context, "receive", "request-1", {
      destinationLocationId: "pharmacy",
      lines: [
        { itemId: "item-1", lotId: "lot-1", unit: "tablet", quantity: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(store.lines).toEqual([
      expect.objectContaining({ lotId: "lot-1", expiryDate: "2026-12-31" }),
    ]);
  });

  it("rejects malformed hierarchy cycles and bounded-depth overflow", async () => {
    const store = new MemoryStore();
    store.locations.set("pharmacy", {
      ...location("pharmacy"),
      parentLocationId: "parent",
    });
    store.locations.set("parent", {
      ...location("parent"),
      parentLocationId: "pharmacy",
    });
    expect(
      await service(store).post(context, "receive", "request-1", {
        destinationLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("requires a bounded reason for adjustment operations", async () => {
    const store = new MemoryStore();
    expect(
      await service(store).post(context, "adjust_increase", "request-1", {
        locationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: "invalid_request" });
  });

  it("rolls back balance, ledger, and idempotency if audit append fails", async () => {
    const store = new MemoryStore();
    store.failAudit = true;
    expect(
      await service(store).post(context, "receive", "request-1", {
        destinationLocationId: "pharmacy",
        lines: [{ itemId: "item-1", unit: "tablet", quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: "provider_unavailable" });
    expect(store.transactions).toHaveLength(0);
    expect(store.balances.size).toBe(0);
    expect(store.requests.size).toBe(0);
  });
});
