import { describe, expect, it, vi } from "vitest";

import { createSessionResolutionService } from "./session-service";

const identity = { uid: "user-1", email: null, displayName: null };
const profile = {
  uid: identity.uid,
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
} as const;

function dependencies() {
  return {
    authenticationProvider: {
      getIdentity: vi.fn().mockResolvedValue(identity),
      subscribe: vi.fn(() => () => undefined),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
    userProfiles: { getByUid: vi.fn().mockResolvedValue(profile) },
    roleAssignments: {
      listByUid: vi.fn().mockResolvedValue([
        {
          uid: identity.uid,
          tenantId: "tenant-1",
          roleId: "pharmacy_staff",
          scope: {
            kind: "facility",
            platformId: "platform-1",
            organizationId: "organization-1",
            facilityId: "facility-1",
          },
        },
      ]),
    },
    tenantDirectories: {
      getByTenantId: vi.fn().mockResolvedValue({
        tenantId: "tenant-1",
        platformId: "platform-1",
        organizations: [{ id: "organization-1" }],
        facilities: [{ id: "facility-1", organizationId: "organization-1" }],
      }),
    },
  };
}

describe("session service boundary", () => {
  it("does not query trusted profile data for an unauthenticated provider", async () => {
    const deps = dependencies();
    deps.authenticationProvider.getIdentity.mockResolvedValue(null);
    const service = createSessionResolutionService(deps);

    await expect(service.resolve()).resolves.toEqual({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    expect(deps.userProfiles.getByUid).not.toHaveBeenCalled();
    expect(deps.roleAssignments.listByUid).not.toHaveBeenCalled();
  });

  it("resolves server-owned profile, roles, and tenant directory", async () => {
    const service = createSessionResolutionService(dependencies());
    const result = await service.resolve();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.uid).toBe(identity.uid);
      expect(result.user.roleAssignments[0]?.role).toBe("pharmacy_staff");
    }
  });

  it("maps adapter failures to a typed provider error", async () => {
    const deps = dependencies();
    deps.authenticationProvider.getIdentity.mockRejectedValue(
      new Error("provider unavailable"),
    );
    const service = createSessionResolutionService(deps);

    await expect(service.resolve()).resolves.toEqual({
      ok: false,
      failure: {
        category: "provider_error",
        reason: "provider_unavailable",
      },
    });
  });
});
