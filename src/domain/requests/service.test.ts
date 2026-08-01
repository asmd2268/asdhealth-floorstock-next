import { describe, expect, it } from "vitest";

import type {
  FloorStockRequestStore,
  FloorStockRequestTransaction,
} from "./store";
import { createFloorStockRequestService } from "./service";
import type {
  FloorStockRequestActorContext,
  FloorStockRequestLineRecord,
  FloorStockRequestRecord,
} from "./types";

const departmentContext: FloorStockRequestActorContext = {
  uid: "department-user-1",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "organization-1",
  activeFacilityId: "facility-1",
  activeDepartmentId: "department-1",
  activeScope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
  roleAssignments: [],
  explicitPermissionOverrides: [],
  featureFlags: {
    new_request: true,
  } as FloorStockRequestActorContext["featureFlags"],
  trustedStateFingerprint: "fingerprint-department",
};

const pharmacyContext: FloorStockRequestActorContext = {
  ...departmentContext,
  uid: "pharmacy-user-1",
  activeDepartmentId: null,
  trustedStateFingerprint: "fingerprint-pharmacy",
};

const configuration = {
  schemaVersion: 1,
  configurationId: "configuration-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
  departmentId: "department-1",
  locationId: "location-1",
  itemId: "item-1",
  unit: "tablet",
  minimumQuantity: 10,
  reorderThreshold: 20,
  maximumQuantity: 30,
  status: "active",
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
  dispensingUnit: "tablet",
  unitConversions: [],
  status: "active",
  lotControlled: false,
  expiryControlled: false,
  negativeStockAllowed: false,
  barcodeIds: [],
};

const location = {
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
};

class FakeStore implements FloorStockRequestStore {
  authorized = true;
  failAudit = false;
  configurations = new Map<string, unknown>([
    ["configuration-1", configuration],
  ]);
  items = new Map<string, unknown>([["item-1", item]]);
  locations = new Map<string, unknown>([["location-1", location]]);
  requests = new Map<string, FloorStockRequestRecord>();
  lines = new Map<string, FloorStockRequestLineRecord>();
  markers = new Map<string, unknown>();
  audits = new Map<string, unknown>();

  async runTransaction<T>(
    operation: (transaction: FloorStockRequestTransaction) => Promise<T>,
  ): Promise<T> {
    const pending: Array<() => void> = [];
    const transaction: FloorStockRequestTransaction = {
      revalidateActor: async () => this.authorized,
      getRequest: async (id) => this.requests.get(id) ?? null,
      getConfiguration: async (id) => this.configurations.get(id) ?? null,
      getItem: async (id) => this.items.get(id) ?? null,
      getLocation: async (id) => this.locations.get(id) ?? null,
      getIdempotency: async (id) => this.markers.get(id) ?? null,
      listLines: async (requestId, maximum) =>
        [...this.lines.values()]
          .filter((line) => line.floorStockRequestId === requestId)
          .sort((left, right) => left.lineNumber - right.lineNumber)
          .slice(0, maximum),
      createRequest: (record) =>
        pending.push(() =>
          this.requests.set(record.floorStockRequestId, record),
        ),
      setRequest: (record) =>
        pending.push(() =>
          this.requests.set(record.floorStockRequestId, record),
        ),
      createLine: (record) =>
        pending.push(() => this.lines.set(record.lineId, record)),
      setLine: (record) =>
        pending.push(() => this.lines.set(record.lineId, record)),
      createAudit: (record) => {
        if (this.failAudit) throw new Error("audit unavailable");
        pending.push(() => this.audits.set(record.eventId, record));
      },
      createIdempotency: (record) =>
        pending.push(() => this.markers.set(record.namespaceId, record)),
    };
    const result = await operation(transaction);
    pending.forEach((commit) => commit());
    return result;
  }
}

function target(store: FakeStore) {
  let requestNumber = 0;
  let auditNumber = 0;
  return createFloorStockRequestService(
    store,
    () => new Date("2028-01-02T00:00:00.000Z"),
    () => `floor-request-${++requestNumber}`,
    () => `audit-${++auditNumber}`,
  );
}

async function createDraft(store: FakeStore) {
  return target(store).mutate(
    departmentContext,
    "create",
    "correlation-create",
    null,
    {
      note: "Ward request",
      lines: [{ configurationId: "configuration-1", quantity: 12 }],
    },
  );
}

describe("floor-stock request service", () => {
  it("atomically creates a trusted department draft and snapshots its line", async () => {
    const store = new FakeStore();
    const result = await createDraft(store);
    expect(result).toEqual({
      ok: true,
      value: {
        floorStockRequestId: "floor-request-1",
        status: "draft",
        duplicate: false,
      },
    });
    expect(store.requests.get("floor-request-1")).toMatchObject({
      tenantId: "tenant-1",
      facilityId: "facility-1",
      departmentId: "department-1",
      requestedByUid: "department-user-1",
      lineCount: 1,
      note: "Ward request",
    });
    expect([...store.lines.values()][0]).toMatchObject({
      configurationId: "configuration-1",
      itemId: "item-1",
      locationId: "location-1",
      unit: "tablet",
      requestedQuantity: 12,
      approvedQuantity: null,
      fulfilledQuantity: null,
    });
    expect(store.audits.size).toBe(1);
    expect(store.markers.size).toBe(1);
  });

  it("runs the strict submit, approval, fulfillment, ready, and delivery lifecycle", async () => {
    const store = new FakeStore();
    const service = target(store);
    await service.mutate(departmentContext, "create", "c-1", null, {
      lines: [{ configurationId: "configuration-1", quantity: 8 }],
    });
    const id = "floor-request-1";
    expect(
      await service.mutate(departmentContext, "submit", "c-2", id, {}),
    ).toMatchObject({ ok: true, value: { status: "submitted" } });
    expect(
      await service.mutate(pharmacyContext, "approve", "c-3", id, {}),
    ).toMatchObject({ ok: true, value: { status: "approved" } });
    expect([...store.lines.values()][0]?.approvedQuantity).toBe(8);
    expect(
      await service.mutate(pharmacyContext, "start_fulfillment", "c-4", id, {}),
    ).toMatchObject({ ok: true, value: { status: "fulfilling" } });
    expect(
      await service.mutate(
        pharmacyContext,
        "complete_fulfillment",
        "c-5",
        id,
        {},
      ),
    ).toMatchObject({ ok: true, value: { status: "ready" } });
    expect([...store.lines.values()][0]?.fulfilledQuantity).toBe(8);
    expect(
      await service.mutate(pharmacyContext, "deliver", "c-6", id, {}),
    ).toMatchObject({ ok: true, value: { status: "delivered" } });
    expect(store.requests.get(id)).toMatchObject({
      status: "delivered",
      version: 6,
      submittedAt: "2028-01-02T00:00:00.000Z",
      approvedAt: "2028-01-02T00:00:00.000Z",
      fulfillmentStartedAt: "2028-01-02T00:00:00.000Z",
      readyAt: "2028-01-02T00:00:00.000Z",
      deliveredAt: "2028-01-02T00:00:00.000Z",
    });
  });

  it("allows rejection and creator cancellation only from valid states", async () => {
    const store = new FakeStore();
    const service = target(store);
    await service.mutate(departmentContext, "create", "c-1", null, {
      lines: [{ configurationId: "configuration-1", quantity: 1 }],
    });
    const id = "floor-request-1";
    expect(
      await service.mutate(pharmacyContext, "reject", "c-2", id, {}),
    ).toEqual({ ok: false, code: "conflict" });
    await service.mutate(departmentContext, "submit", "c-3", id, {});
    expect(
      await service.mutate(pharmacyContext, "reject", "c-4", id, {}),
    ).toMatchObject({ ok: true, value: { status: "rejected" } });
    expect(
      await service.mutate(departmentContext, "cancel", "c-5", id, {}),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("fails closed for cross-department configuration and inactive parents", async () => {
    const store = new FakeStore();
    store.configurations.set("configuration-1", {
      ...configuration,
      departmentId: "department-2",
    });
    expect(await createDraft(store)).toEqual({ ok: false, code: "forbidden" });
    store.configurations.set("configuration-1", configuration);
    store.items.set("item-1", { ...item, status: "inactive" });
    expect(await createDraft(store)).toEqual({
      ok: false,
      code: "inactive_item",
    });
  });

  it("rejects duplicate semantic line numbers in a stored request", async () => {
    const store = new FakeStore();
    const service = target(store);
    await service.mutate(departmentContext, "create", "c-1", null, {
      lines: [{ configurationId: "configuration-1", quantity: 2 }],
    });
    await service.mutate(
      departmentContext,
      "submit",
      "c-2",
      "floor-request-1",
      {},
    );
    const existing = [...store.lines.values()][0]!;
    store.lines.set("malicious-line", {
      ...existing,
      lineId: "malicious-line",
    });
    store.requests.set("floor-request-1", {
      ...store.requests.get("floor-request-1")!,
      lineCount: 2,
    });
    expect(
      await service.mutate(
        pharmacyContext,
        "approve",
        "c-3",
        "floor-request-1",
        {},
      ),
    ).toEqual({ ok: false, code: "conflict" });
  });

  it("rejects quantities beyond the trusted maximum and duplicate configurations", async () => {
    const store = new FakeStore();
    const service = target(store);
    expect(
      await service.mutate(departmentContext, "create", "c-1", null, {
        lines: [{ configurationId: "configuration-1", quantity: 31 }],
      }),
    ).toEqual({ ok: false, code: "invalid_request" });
    expect(
      await service.mutate(departmentContext, "create", "c-2", null, {
        lines: [
          { configurationId: "configuration-1", quantity: 1 },
          { configurationId: "configuration-1", quantity: 2 },
        ],
      }),
    ).toEqual({ ok: false, code: "invalid_request" });
  });

  it("binds idempotency to actor, operation, target, and payload", async () => {
    const store = new FakeStore();
    const service = target(store);
    const body = {
      lines: [{ configurationId: "configuration-1", quantity: 4 }],
    };
    const first = await service.mutate(
      departmentContext,
      "create",
      "same-key",
      null,
      body,
    );
    expect(first).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(
      await service.mutate(departmentContext, "create", "same-key", null, body),
    ).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(
      await service.mutate(departmentContext, "create", "same-key", null, {
        lines: [{ configurationId: "configuration-1", quantity: 5 }],
      }),
    ).toEqual({ ok: false, code: "conflict" });
    expect(
      await service.mutate(pharmacyContext, "create", "same-key", null, body),
    ).toEqual({ ok: false, code: "forbidden" });
  });

  it("revalidates authority before idempotent replay", async () => {
    const store = new FakeStore();
    const service = target(store);
    const body = {
      lines: [{ configurationId: "configuration-1", quantity: 4 }],
    };
    await service.mutate(departmentContext, "create", "same-key", null, body);
    store.authorized = false;
    expect(
      await service.mutate(departmentContext, "create", "same-key", null, body),
    ).toEqual({ ok: false, code: "forbidden" });
  });

  it("rolls back request, lines, and idempotency when audit creation fails", async () => {
    const store = new FakeStore();
    store.failAudit = true;
    expect(await createDraft(store)).toEqual({
      ok: false,
      code: "provider_unavailable",
    });
    expect(store.requests.size).toBe(0);
    expect(store.lines.size).toBe(0);
    expect(store.markers.size).toBe(0);
  });
});
