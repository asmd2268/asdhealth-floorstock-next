import { describe, expect, it, vi } from "vitest";

import { createServerTrustedRepositoryAdapters } from "./trusted-repositories";

const profile = {
  uid: "user-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
};
const assignment = {
  uid: "user-1",
  tenantId: "tenant-1",
  roleId: "pharmacy_manager",
  scope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
};
const directory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [{ id: "facility-1", organizationId: "organization-1" }],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
    inventory: false,
  },
};

function firestore(values: {
  profile?: unknown;
  assignments?: readonly unknown[];
  directory?: unknown;
}) {
  const documents = new Map<string, unknown>([
    ["userProfiles/user-1", values.profile ?? profile],
    ["tenantDirectories/tenant-1", values.directory ?? directory],
  ]);
  const query = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({
      size: (values.assignments ?? [assignment]).length,
      docs: (values.assignments ?? [assignment]).map((value) => ({
        data: () => value,
      })),
    }),
  };
  return {
    doc: vi.fn((path: string) => ({
      get: vi.fn().mockResolvedValue({
        exists: documents.has(path),
        data: () => documents.get(path),
      }),
    })),
    collection: vi.fn(() => query),
    query,
  };
}

describe("server trusted repository adapters", () => {
  it("loads only the UID-derived profile, matching assignments, and profile-derived tenant", async () => {
    const sdk = firestore({});
    const repositories = createServerTrustedRepositoryAdapters(sdk as never);
    await expect(repositories.userProfiles.getByUid("user-1")).resolves.toEqual(
      profile,
    );
    await expect(
      repositories.roleAssignments.listByUid("user-1", "tenant-1"),
    ).resolves.toEqual([assignment]);
    await expect(
      repositories.tenantDirectories.getByTenantId("tenant-1"),
    ).resolves.toEqual(directory);
    expect(sdk.doc).toHaveBeenNthCalledWith(1, "userProfiles/user-1");
    expect(sdk.collection).toHaveBeenCalledWith(
      "userRoleAssignments/user-1/assignments",
    );
    expect(sdk.query.where).toHaveBeenNthCalledWith(1, "uid", "==", "user-1");
    expect(sdk.query.where).toHaveBeenNthCalledWith(
      2,
      "tenantId",
      "==",
      "tenant-1",
    );
  });

  it("rejects malicious query results with a mismatched UID or tenant", async () => {
    for (const malicious of [
      { ...assignment, uid: "user-2" },
      { ...assignment, tenantId: "tenant-2" },
    ]) {
      const repositories = createServerTrustedRepositoryAdapters(
        firestore({ assignments: [malicious] }) as never,
      );
      await expect(
        repositories.roleAssignments.listByUid("user-1", "tenant-1"),
      ).rejects.toThrow("boundary mismatch");
    }
  });

  it("rejects malformed trusted documents at the server adapter boundary", async () => {
    const malformedProfile = createServerTrustedRepositoryAdapters(
      firestore({
        profile: { ...profile, facilityIds: ["facility/escape"] },
      }) as never,
    );
    await expect(
      malformedProfile.userProfiles.getByUid("user-1"),
    ).rejects.toThrow();

    const malformedDirectory = createServerTrustedRepositoryAdapters(
      firestore({
        directory: { ...directory, featureFlags: undefined },
      }) as never,
    );
    await expect(
      malformedDirectory.tenantDirectories.getByTenantId("tenant-1"),
    ).rejects.toThrow();
  });
});
