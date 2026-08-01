import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "@/server/session/types";

import { resolveFloorStockRequestContext } from "./context";

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
        uid: "department-user-1",
        email: null,
        displayName: null,
        tenantId: "tenant-1",
        platformId: "platform-1",
        organizationId: "organization-1",
        facilityIds: ["facility-1"],
        activeFacilityId: "facility-1",
        departmentIds: ["department-1"],
        activeDepartmentId: "department-1",
        activeScope: scope,
        roleAssignments: [{ role: "department_user", scope }],
        explicitPermissionOverrides: [],
        accountStatus: "active" as const,
      },
      featureFlags: {
        announcements: false,
        zebra_labels: false,
        new_request: true,
        controlled_medicines: false,
        inventory: false,
      },
    },
  },
};
const credential = `${"a".repeat(43)}.${"b".repeat(43)}`;

describe("floor-stock request context", () => {
  it("derives department scope and operation permission from the server session", async () => {
    const authorize = vi.fn().mockResolvedValue(session);
    const result = await resolveFloorStockRequestContext(
      `asdhealth_session=${credential}`,
      "submit",
      {
        production: false,
        sessionService: () =>
          ({ authorize }) as unknown as ServerSessionService,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        uid: "department-user-1",
        tenantId: "tenant-1",
        activeFacilityId: "facility-1",
        activeDepartmentId: "department-1",
      },
    });
    expect(authorize).toHaveBeenCalledWith(credential, {
      resource: "new_request",
      action: "edit",
    });
  });

  it("requires a trusted active department for department operations", async () => {
    const invalid = structuredClone(session);
    invalid.value.trusted.user.activeDepartmentId = null as unknown as string;
    const result = await resolveFloorStockRequestContext(
      `asdhealth_session=${credential}`,
      "create",
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

  it("fails closed for disabled features and ambiguous cookies", async () => {
    const disabled = structuredClone(session);
    disabled.value.trusted.featureFlags.new_request = false;
    expect(
      await resolveFloorStockRequestContext(
        `asdhealth_session=${credential}`,
        "submit",
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
      await resolveFloorStockRequestContext(
        `asdhealth_session=${credential}; asdhealth_session=${credential}`,
        "submit",
        {
          production: false,
          sessionService: () =>
            ({ authorize: vi.fn() }) as unknown as ServerSessionService,
        },
      ),
    ).toEqual({ ok: false, code: "unauthenticated" });
  });
});
