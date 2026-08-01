import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser, TenantDirectory } from "@/domain/auth/types";

import { resolveFacilityDisplayOptions } from "./facility-options";

const user: AuthenticatedUser = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "User",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1", "facility-2"],
  activeFacilityId: "facility-1",
  departmentIds: [],
  activeDepartmentId: null,
  activeScope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
  roleAssignments: [
    {
      role: "pharmacy_manager",
      scope: {
        kind: "organization",
        platformId: "platform-1",
        organizationId: "organization-1",
      },
    },
  ],
  explicitPermissionOverrides: [],
  accountStatus: "active",
};

const directory: TenantDirectory = {
  tenantId: "tenant-1",
  platformId: "platform-1",
  status: "active",
  organizations: [{ id: "organization-1" }],
  facilities: [
    {
      id: "facility-1",
      organizationId: "organization-1",
      displayName: "Central Hospital",
    },
    { id: "facility-2", organizationId: "organization-1" },
  ],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: true,
    controlled_medicines: false,
  },
};
const featureFlags = directory.featureFlags!;

function repository(value: TenantDirectory | null = directory) {
  return { getByTenantId: vi.fn().mockResolvedValue(value) };
}

describe("sanitized facility display options", () => {
  it("returns only canonical IDs and safe labels in canonical membership order", async () => {
    await expect(
      resolveFacilityDisplayOptions(user, featureFlags, repository()),
    ).resolves.toEqual([
      { id: "facility-1", displayName: "Central Hospital" },
      { id: "facility-2", displayName: "facility-2" },
    ]);
  });

  it.each([
    null,
    { ...directory, status: "inactive" as const },
    { ...directory, tenantId: "tenant-2" },
    { ...directory, platformId: "platform-2" },
    { ...directory, facilities: directory.facilities.slice(1) },
    {
      ...directory,
      facilities: [
        {
          ...directory.facilities[0],
          organizationId: "organization-2",
        },
        directory.facilities[1],
      ],
    },
  ])("fails closed for stale or mismatched directory data", async (value) => {
    await expect(
      resolveFacilityDisplayOptions(user, featureFlags, repository(value)),
    ).resolves.toBeNull();
  });

  it("fails closed when the trusted directory provider is unavailable", async () => {
    await expect(
      resolveFacilityDisplayOptions(user, featureFlags, {
        getByTenantId: vi
          .fn()
          .mockRejectedValue(new Error("raw provider detail")),
      }),
    ).resolves.toBeNull();
  });

  it("omits facilities outside current role scope or covered by an explicit deny", async () => {
    const facilityScopedUser: AuthenticatedUser = {
      ...user,
      roleAssignments: [
        {
          role: "pharmacy_manager",
          scope: user.activeScope,
        },
      ],
    };
    await expect(
      resolveFacilityDisplayOptions(
        facilityScopedUser,
        featureFlags,
        repository(),
      ),
    ).resolves.toEqual([{ id: "facility-1", displayName: "Central Hospital" }]);

    await expect(
      resolveFacilityDisplayOptions(
        {
          ...user,
          explicitPermissionOverrides: [
            {
              effect: "deny",
              resource: "dashboard",
              action: "read",
              scope: {
                kind: "facility",
                platformId: "platform-1",
                organizationId: "organization-1",
                facilityId: "facility-2",
              },
            },
          ],
        },
        featureFlags,
        repository(),
      ),
    ).resolves.toEqual([{ id: "facility-1", displayName: "Central Hospital" }]);
  });
});
