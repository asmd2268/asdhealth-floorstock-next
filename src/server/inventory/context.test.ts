import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "@/server/session/types";

import { resolveInventoryContext } from "./context";

const scope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "org-1",
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
        organizationId: "org-1",
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

describe("inventory context", () => {
  const credential = `${"a".repeat(43)}.${"b".repeat(43)}`;
  it("derives active-facility authority only from the server session", async () => {
    const authorize = vi.fn().mockResolvedValue(session);
    const result = await resolveInventoryContext(
      `asdhealth_session=${credential}`,
      "receive",
      {
        production: false,
        sessionService: () =>
          ({ authorize }) as unknown as ServerSessionService,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { tenantId: "tenant-1", activeFacilityId: "facility-1" },
    });
    expect(authorize).toHaveBeenCalledWith(credential, {
      resource: "inventory_stock",
      action: "receive",
    });
  });

  it("fails closed when inventory is disabled or active scope is inconsistent", async () => {
    const invalid = structuredClone(session);
    invalid.value.trusted.featureFlags.inventory = false;
    const result = await resolveInventoryContext(
      `asdhealth_session=${credential}`,
      "issue",
      {
        production: false,
        sessionService: () =>
          ({
            authorize: vi.fn().mockResolvedValue(invalid),
          }) as unknown as ServerSessionService,
      },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
  });

  it("rejects duplicate or missing session cookies", async () => {
    const service = () =>
      ({ authorize: vi.fn() }) as unknown as ServerSessionService;
    expect(
      await resolveInventoryContext(null, "receive", {
        production: false,
        sessionService: service,
      }),
    ).toEqual({ ok: false, code: "unauthenticated" });
    expect(
      await resolveInventoryContext(
        `asdhealth_session=${credential}; asdhealth_session=${credential}`,
        "receive",
        { production: false, sessionService: service },
      ),
    ).toEqual({ ok: false, code: "unauthenticated" });
  });
});
