import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "@/server/session/types";

import { resolveInventoryProvisioningContext } from "./provisioning-context";

const scope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;
const session = {
  ok: true as const,
  value: {
    record: {},
    trusted: {
      ok: true as const,
      user: {
        uid: "user-1",
        email: null,
        displayName: null,
        tenantId: "tenant-1",
        platformId: "platform-1",
        organizationId: "organization-1",
        facilityIds: ["facility-1"],
        activeFacilityId: "facility-1",
        departmentIds: [],
        activeDepartmentId: null,
        activeScope: scope,
        roleAssignments: [{ role: "pharmacy_manager", scope }],
        explicitPermissionOverrides: [],
        accountStatus: "active" as const,
      },
      featureFlags: {
        announcements: false,
        zebra_labels: false,
        new_request: false,
        controlled_medicines: false,
        inventory: true,
      },
    },
  },
};
const credential = `${"a".repeat(43)}.${"b".repeat(43)}`;

describe("inventory provisioning context", () => {
  it.each([
    ["upsert_item", "inventory_item"],
    ["upsert_location", "inventory_location"],
    ["upsert_lot", "inventory_lot"],
    ["upsert_floor_stock_configuration", "floor_stock_configuration"],
  ] as const)(
    "requests manage authority for %s",
    async (operation, resource) => {
      const authorize = vi.fn().mockResolvedValue(session);
      const result = await resolveInventoryProvisioningContext(
        `asdhealth_session=${credential}`,
        operation,
        {
          production: false,
          sessionService: () =>
            ({ authorize }) as unknown as ServerSessionService,
        },
      );
      expect(result).toMatchObject({
        ok: true,
        value: {
          tenantId: "tenant-1",
          activeFacilityId: "facility-1",
        },
      });
      expect(authorize).toHaveBeenCalledWith(credential, {
        resource,
        action: "manage",
      });
    },
  );

  it("fails closed for a disabled feature or duplicate session cookie", async () => {
    const disabled = structuredClone(session);
    disabled.value.trusted.featureFlags.inventory = false;
    expect(
      await resolveInventoryProvisioningContext(
        `asdhealth_session=${credential}`,
        "upsert_location",
        {
          production: false,
          sessionService: () =>
            ({
              authorize: vi.fn().mockResolvedValue(disabled),
            }) as unknown as ServerSessionService,
        },
      ),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await resolveInventoryProvisioningContext(
        `asdhealth_session=${credential}; asdhealth_session=${credential}`,
        "upsert_location",
        {
          production: false,
          sessionService: () =>
            ({ authorize: vi.fn() }) as unknown as ServerSessionService,
        },
      ),
    ).toEqual({ ok: false, code: "unauthenticated" });
  });
});
