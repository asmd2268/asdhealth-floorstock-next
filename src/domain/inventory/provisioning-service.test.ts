import { describe, expect, it } from "vitest";

import type {
  InventoryProvisioningStore,
  InventoryProvisioningTransaction,
} from "./provisioning-store";
import { createInventoryProvisioningService } from "./provisioning-service";
import type { InventoryProvisioningActorContext } from "./provisioning-types";
import type {
  FloorStockConfigurationRecord,
  InventoryBalanceRecord,
  InventoryLocationRecord,
  InventoryLotRecord,
  MedicationItemRecord,
} from "./types";

const context: InventoryProvisioningActorContext = {
  uid: "user-1",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "organization-1",
  activeFacilityId: "facility-1",
  activeScope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
  roleAssignments: [],
  explicitPermissionOverrides: [],
  featureFlags: {
    inventory: true,
  } as InventoryProvisioningActorContext["featureFlags"],
  trustedStateFingerprint: "fingerprint-1",
};

const itemInput = {
  itemCode: "ITEM-1",
  genericName: "Medicine",
  dosageForm: "Tablet",
  strength: "10 mg",
  baseUnit: "tablet" as const,
  dispensingUnit: "tablet" as const,
  unitConversions: [],
  status: "active" as const,
  lotControlled: true,
  expiryControlled: true,
  negativeStockAllowed: false,
  barcodeIds: [],
};

const itemRecord = (
  overrides: Partial<MedicationItemRecord> = {},
): MedicationItemRecord => ({
  schemaVersion: 1,
  itemId: "item-1",
  tenantId: "tenant-1",
  ...itemInput,
  ...overrides,
});

const locationRecord = (
  overrides: Partial<InventoryLocationRecord> = {},
): InventoryLocationRecord => ({
  schemaVersion: 1,
  locationId: "location-1",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
  departmentId: "department-1",
  parentLocationId: null,
  kind: "floor_stock",
  displayName: "Ward stock",
  status: "active",
  ...overrides,
});

class FakeStore implements InventoryProvisioningStore {
  authorized = true;
  failAudit = false;
  items = new Map<string, unknown>();
  locations = new Map<string, unknown>();
  lots = new Map<string, unknown>();
  configurations = new Map<string, unknown>();
  balances = new Map<string, InventoryBalanceRecord>();
  requests = new Map<string, unknown>();
  audits = new Map<string, unknown>();

  async runTransaction<T>(
    operation: (transaction: InventoryProvisioningTransaction) => Promise<T>,
  ): Promise<T> {
    const pending: (() => void)[] = [];
    const values = <TValue>(map: Map<string, TValue>) => [...map.values()];
    const transaction: InventoryProvisioningTransaction = {
      revalidateActor: async () => this.authorized,
      getItem: async (id) => this.items.get(id) ?? null,
      getLocation: async (id) => this.locations.get(id) ?? null,
      getLot: async (id) => this.lots.get(id) ?? null,
      getConfiguration: async (id) => this.configurations.get(id) ?? null,
      getRequest: async (id) => this.requests.get(id) ?? null,
      listItemsByCode: async (tenantId, itemCode, maximum) =>
        values(this.items)
          .filter(
            (value) =>
              (value as MedicationItemRecord).tenantId === tenantId &&
              (value as MedicationItemRecord).itemCode === itemCode,
          )
          .slice(0, maximum),
      listLotsByIdentity: async (
        tenantId,
        facilityId,
        itemId,
        lotNumber,
        maximum,
      ) =>
        values(this.lots)
          .filter((value) => {
            const lot = value as InventoryLotRecord;
            return (
              lot.tenantId === tenantId &&
              lot.facilityId === facilityId &&
              lot.itemId === itemId &&
              lot.lotNumber === lotNumber
            );
          })
          .slice(0, maximum),
      listConfigurationsByIdentity: async (
        tenantId,
        facilityId,
        departmentId,
        locationId,
        itemId,
        maximum,
      ) =>
        values(this.configurations)
          .filter((value) => {
            const configuration = value as FloorStockConfigurationRecord;
            return (
              configuration.tenantId === tenantId &&
              configuration.facilityId === facilityId &&
              configuration.departmentId === departmentId &&
              configuration.locationId === locationId &&
              configuration.itemId === itemId
            );
          })
          .slice(0, maximum),
      hasItemActivity: async (tenantId, itemId) =>
        values(this.balances).some(
          (balance) =>
            balance.tenantId === tenantId && balance.itemId === itemId,
        ),
      hasLocationActivity: async (tenantId, facilityId, locationId) =>
        values(this.balances).some(
          (balance) =>
            balance.tenantId === tenantId &&
            balance.facilityId === facilityId &&
            balance.locationId === locationId,
        ),
      hasLotActivity: async (tenantId, facilityId, lotId) =>
        values(this.balances).some(
          (balance) =>
            balance.tenantId === tenantId &&
            balance.facilityId === facilityId &&
            balance.lotId === lotId,
        ),
      setItem: (record) =>
        pending.push(() => this.items.set(record.itemId, record)),
      setLocation: (record) =>
        pending.push(() => this.locations.set(record.locationId, record)),
      setLot: (record) =>
        pending.push(() => this.lots.set(record.lotId, record)),
      setConfiguration: (record) =>
        pending.push(() =>
          this.configurations.set(record.configurationId, record),
        ),
      createAudit: (record) => {
        if (this.failAudit) throw new Error("audit unavailable");
        pending.push(() => this.audits.set(record.eventId, record));
      },
      createRequest: (record) =>
        pending.push(() => this.requests.set(record.namespaceId, record)),
    };
    const result = await operation(transaction);
    pending.forEach((commit) => commit());
    return result;
  }
}

function service(store: FakeStore) {
  let nextId = 0;
  return createInventoryProvisioningService(store, {
    now: () => new Date("2028-01-02T00:00:00.000Z"),
    id: () => `event-${++nextId}`,
  });
}

function balance(
  overrides: Partial<InventoryBalanceRecord> = {},
): InventoryBalanceRecord {
  return {
    schemaVersion: 1,
    balanceId: "balance-1",
    tenantId: "tenant-1",
    facilityId: "facility-1",
    departmentId: "department-1",
    locationId: "location-1",
    itemId: "item-1",
    lotId: "lot-1",
    expiryDate: "2029-01-01",
    unit: "tablet",
    quantity: 1,
    version: 1,
    updatedAt: "2028-01-01T00:00:00.000Z",
    lastTransactionId: "transaction-1",
    ...overrides,
  };
}

describe("inventory provisioning service", () => {
  it("atomically provisions an item with trusted tenant scope", async () => {
    const store = new FakeStore();
    const result = await service(store).upsert(
      context,
      "upsert_item",
      "item-1",
      "request-1",
      itemInput,
    );
    expect(result).toEqual({
      ok: true,
      value: { targetId: "item-1", duplicate: false },
    });
    expect(store.items.get("item-1")).toEqual(itemRecord());
    expect(store.audits.size).toBe(1);
    expect(store.requests.size).toBe(1);
  });

  it("rejects duplicate item codes and post-activity identity changes", async () => {
    const store = new FakeStore();
    store.items.set("item-other", itemRecord({ itemId: "item-other" }));
    expect(
      await service(store).upsert(
        context,
        "upsert_item",
        "item-1",
        "request-1",
        itemInput,
      ),
    ).toEqual({ ok: false, code: "conflict" });

    store.items.clear();
    store.items.set("item-1", itemRecord());
    store.balances.set("balance-1", balance());
    expect(
      await service(store).upsert(
        context,
        "upsert_item",
        "item-1",
        "request-2",
        { ...itemInput, baseUnit: "each", dispensingUnit: "each" },
      ),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("validates location hierarchy and locks semantic identity after activity", async () => {
    const store = new FakeStore();
    store.locations.set(
      "parent-1",
      locationRecord({
        locationId: "parent-1",
        kind: "pharmacy",
        departmentId: null,
        parentLocationId: "location-1",
      }),
    );
    expect(
      await service(store).upsert(
        context,
        "upsert_location",
        "location-1",
        "request-1",
        {
          departmentId: "department-1",
          parentLocationId: "parent-1",
          kind: "floor_stock",
          displayName: "Ward stock",
          status: "active",
        },
      ),
    ).toEqual({ ok: false, code: "conflict" });

    store.locations.clear();
    store.locations.set("location-1", locationRecord());
    store.balances.set("balance-1", balance());
    expect(
      await service(store).upsert(
        context,
        "upsert_location",
        "location-1",
        "request-2",
        {
          departmentId: "department-1",
          parentLocationId: null,
          kind: "ward",
          displayName: "Renamed",
          status: "active",
        },
      ),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("provisions facility-bound lots only for active lot-controlled items", async () => {
    const store = new FakeStore();
    store.items.set("item-1", itemRecord());
    const result = await service(store).upsert(
      context,
      "upsert_lot",
      "lot-1",
      "request-1",
      {
        itemId: "item-1",
        lotNumber: "LOT-1",
        expiryDate: "2029-01-01",
        status: "active",
      },
    );
    expect(result.ok).toBe(true);
    expect(store.lots.get("lot-1")).toEqual({
      schemaVersion: 1,
      lotId: "lot-1",
      tenantId: "tenant-1",
      facilityId: "facility-1",
      itemId: "item-1",
      lotNumber: "LOT-1",
      expiryDate: "2029-01-01",
      status: "active",
    });

    store.items.set(
      "item-2",
      itemRecord({
        itemId: "item-2",
        lotControlled: false,
        expiryControlled: false,
      }),
    );
    expect(
      await service(store).upsert(context, "upsert_lot", "lot-2", "request-2", {
        itemId: "item-2",
        lotNumber: "LOT-2",
        expiryDate: "2029-01-01",
        status: "active",
      }),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("locks lot identity after activity", async () => {
    const store = new FakeStore();
    store.items.set("item-1", itemRecord());
    store.lots.set("lot-1", {
      schemaVersion: 1,
      lotId: "lot-1",
      tenantId: "tenant-1",
      facilityId: "facility-1",
      itemId: "item-1",
      lotNumber: "LOT-1",
      expiryDate: "2029-01-01",
      status: "active",
    });
    store.balances.set("balance-1", balance());
    expect(
      await service(store).upsert(context, "upsert_lot", "lot-1", "request-1", {
        itemId: "item-1",
        lotNumber: "LOT-1",
        expiryDate: "2030-01-01",
        status: "active",
      }),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("provisions ordered floor-stock thresholds for a matching department", async () => {
    const store = new FakeStore();
    store.items.set("item-1", itemRecord());
    store.locations.set("location-1", locationRecord());
    const input = {
      departmentId: "department-1",
      locationId: "location-1",
      itemId: "item-1",
      unit: "tablet" as const,
      minimumQuantity: 10,
      reorderThreshold: 20,
      maximumQuantity: 30,
      status: "active" as const,
    };
    expect(
      await service(store).upsert(
        context,
        "upsert_floor_stock_configuration",
        "configuration-1",
        "request-1",
        input,
      ),
    ).toEqual({
      ok: true,
      value: { targetId: "configuration-1", duplicate: false },
    });
    expect(
      await service(store).upsert(
        context,
        "upsert_floor_stock_configuration",
        "configuration-2",
        "request-2",
        input,
      ),
    ).toEqual({ ok: false, code: "conflict" });
    expect(
      await service(store).upsert(
        context,
        "upsert_floor_stock_configuration",
        "configuration-3",
        "request-3",
        { ...input, minimumQuantity: 25 },
      ),
    ).toEqual({ ok: false, code: "invalid_request" });
  });

  it("binds idempotency to payload and revalidates authority before replay", async () => {
    const store = new FakeStore();
    const target = service(store);
    expect(
      await target.upsert(
        context,
        "upsert_item",
        "item-1",
        "request-1",
        itemInput,
      ),
    ).toEqual({
      ok: true,
      value: { targetId: "item-1", duplicate: false },
    });
    expect(
      await target.upsert(
        context,
        "upsert_item",
        "item-1",
        "request-1",
        itemInput,
      ),
    ).toEqual({
      ok: true,
      value: { targetId: "item-1", duplicate: true },
    });
    expect(
      await target.upsert(context, "upsert_item", "item-1", "request-1", {
        ...itemInput,
        genericName: "Changed",
      }),
    ).toEqual({ ok: false, code: "conflict" });
    store.authorized = false;
    expect(
      await target.upsert(
        context,
        "upsert_item",
        "item-1",
        "request-1",
        itemInput,
      ),
    ).toEqual({ ok: false, code: "forbidden" });
  });

  it("rolls back the target and request when audit creation fails", async () => {
    const store = new FakeStore();
    store.failAudit = true;
    expect(
      await service(store).upsert(
        context,
        "upsert_item",
        "item-1",
        "request-1",
        itemInput,
      ),
    ).toEqual({ ok: false, code: "provider_unavailable" });
    expect(store.items.size).toBe(0);
    expect(store.requests.size).toBe(0);
  });
});
