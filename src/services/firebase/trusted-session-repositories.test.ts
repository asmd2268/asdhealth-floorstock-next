import { describe, expect, it, vi } from "vitest";

import { createIdentitySessionResolutionService } from "@/services/auth/session-service";

import type { TrustedFirestoreReader } from "./firestore-reader";
import { createTrustedSessionRepositoryAdapters } from "./trusted-session-repositories";
import { trustedSessionLimits } from "./trusted-session-limits";

const identity = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "Example User",
} as const;

const validProfile = {
  uid: identity.uid,
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
} as const;

const validAssignment = {
  uid: identity.uid,
  tenantId: "tenant-1",
  roleId: "pharmacy_manager",
  scope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
} as const;

const validTenant = {
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
  },
} as const;

interface ReaderData {
  profile?: unknown | null;
  assignments?: readonly unknown[];
  tenant?: unknown | null;
}

function reader(data: ReaderData = {}): TrustedFirestoreReader {
  return {
    getDocument: vi.fn(async (path) => {
      if (path[0] === "userProfiles") {
        return data.profile === undefined ? validProfile : data.profile;
      }
      return data.tenant === undefined ? validTenant : data.tenant;
    }),
    listDocuments: vi.fn(async () => data.assignments ?? [validAssignment]),
  };
}

async function resolve(
  data: ReaderData = {},
  requestedActiveFacilityId?: string,
) {
  const repositories = createTrustedSessionRepositoryAdapters(reader(data));
  return createIdentitySessionResolutionService(repositories).resolveIdentity(
    identity,
    requestedActiveFacilityId,
  );
}

function failureReason(result: Awaited<ReturnType<typeof resolve>>) {
  return result.ok ? null : result.failure.reason;
}

describe("trusted Firestore session repositories", () => {
  it("uses explicit paths and normalizes valid repository records", async () => {
    const firestore = reader();
    const repositories = createTrustedSessionRepositoryAdapters(firestore);

    await expect(
      repositories.userProfiles.getByUid(identity.uid),
    ).resolves.toEqual(validProfile);
    await expect(
      repositories.roleAssignments.listByUid(identity.uid, "tenant-1"),
    ).resolves.toEqual([validAssignment]);
    await expect(
      repositories.tenantDirectories.getByTenantId("tenant-1"),
    ).resolves.toEqual(validTenant);

    expect(firestore.getDocument).toHaveBeenNthCalledWith(1, [
      "userProfiles",
      identity.uid,
    ]);
    expect(firestore.listDocuments).toHaveBeenCalledWith(
      ["userRoleAssignments", identity.uid, "assignments"],
      [
        { field: "uid", value: identity.uid },
        { field: "tenantId", value: "tenant-1" },
      ],
      trustedSessionLimits.roleAssignments + 1,
    );
    expect(firestore.getDocument).toHaveBeenNthCalledWith(2, [
      "tenantDirectories",
      "tenant-1",
    ]);
  });

  it("returns null for a missing profile", async () => {
    const repositories = createTrustedSessionRepositoryAdapters(
      reader({ profile: null }),
    );
    await expect(
      repositories.userProfiles.getByUid(identity.uid),
    ).resolves.toBeNull();
  });

  it("rejects profile and assignment UID mismatches at the repository boundary", async () => {
    const mismatchedProfile = createTrustedSessionRepositoryAdapters(
      reader({ profile: { ...validProfile, uid: "other-user" } }),
    );
    await expect(
      mismatchedProfile.userProfiles.getByUid(identity.uid),
    ).rejects.toThrow("identity mismatch");

    const mismatchedAssignment = createTrustedSessionRepositoryAdapters(
      reader({ assignments: [{ ...validAssignment, uid: "other-user" }] }),
    );
    await expect(
      mismatchedAssignment.roleAssignments.listByUid(identity.uid, "tenant-1"),
    ).rejects.toThrow("identity mismatch");
  });

  it("rejects an assignment tenant mismatch at the repository boundary", async () => {
    const repositories = createTrustedSessionRepositoryAdapters(
      reader({
        assignments: [{ ...validAssignment, tenantId: "tenant-malicious" }],
      }),
    );

    await expect(
      repositories.roleAssignments.listByUid(identity.uid, "tenant-1"),
    ).rejects.toThrow("tenant mismatch");
  });

  it("fails closed when the role assignment limit is exceeded", async () => {
    const assignments = Array.from(
      { length: trustedSessionLimits.roleAssignments + 1 },
      () => validAssignment,
    );
    const repositories = createTrustedSessionRepositoryAdapters(
      reader({ assignments }),
    );

    await expect(
      repositories.roleAssignments.listByUid(identity.uid, "tenant-1"),
    ).rejects.toThrow("limit exceeded");
  });

  it("rejects a tenant document ID mismatch", async () => {
    const repositories = createTrustedSessionRepositoryAdapters(
      reader({ tenant: { ...validTenant, tenantId: "tenant-2" } }),
    );
    await expect(
      repositories.tenantDirectories.getByTenantId("tenant-1"),
    ).rejects.toThrow("identity mismatch");
  });

  it("resolves a complete trusted session", async () => {
    const result = await resolve();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toMatchObject({
        uid: identity.uid,
        tenantId: validTenant.tenantId,
        activeFacilityId: "facility-1",
      });
      expect(result.featureFlags).toEqual(validTenant.featureFlags);
    }
  });

  it("re-resolves a requested facility through the complete trusted repository chain", async () => {
    const facility2 = {
      id: "facility-2",
      organizationId: "organization-1",
    } as const;
    const result = await resolve(
      {
        profile: {
          ...validProfile,
          facilityIds: ["facility-1", "facility-2"],
        },
        assignments: [
          validAssignment,
          {
            ...validAssignment,
            scope: { ...validAssignment.scope, facilityId: "facility-2" },
          },
        ],
        tenant: {
          ...validTenant,
          facilities: [...validTenant.facilities, facility2],
        },
      },
      "facility-2",
    );
    expect(result).toMatchObject({
      ok: true,
      user: {
        tenantId: "tenant-1",
        activeFacilityId: "facility-2",
        activeScope: { facilityId: "facility-2" },
      },
    });
  });

  it.each([
    ["missing profile", { profile: null }, "profile_not_found"],
    [
      "disabled account",
      { profile: { ...validProfile, accountStatus: "disabled" } },
      "account_disabled",
    ],
    [
      "inactive account",
      { profile: { ...validProfile, accountStatus: "pending" } },
      "account_inactive",
    ],
    ["missing tenant", { tenant: null }, "tenant_not_found"],
    [
      "inactive tenant",
      { tenant: { ...validTenant, status: "inactive" } },
      "tenant_inactive",
    ],
    ["missing assignments", { assignments: [] }, "role_assignment_missing"],
    [
      "assignment tenant mismatch",
      { assignments: [{ ...validAssignment, tenantId: "tenant-2" }] },
      "provider_unavailable",
    ],
    [
      "invalid facility membership",
      { profile: { ...validProfile, facilityIds: ["facility-2"] } },
      "facility_mismatch",
    ],
    [
      "invalid facility scope",
      {
        assignments: [
          {
            ...validAssignment,
            scope: { ...validAssignment.scope, facilityId: "facility-2" },
          },
        ],
      },
      "role_scope_invalid",
    ],
  ] as const)("fails closed for %s", async (_label, data, expectedReason) => {
    expect(failureReason(await resolve(data))).toBe(expectedReason);
  });

  it.each([
    ["malformed profile", { profile: { ...validProfile, tenantId: 42 } }],
    [
      "unknown role",
      { assignments: [{ ...validAssignment, roleId: "administrator" }] },
    ],
    [
      "malformed feature flags",
      {
        tenant: {
          ...validTenant,
          featureFlags: { ...validTenant.featureFlags, announcements: "yes" },
        },
      },
    ],
  ])(
    "maps %s validation failure to a safe provider error",
    async (_label, data) => {
      const result = await resolve(data);
      expect(result).toEqual({
        ok: false,
        failure: { category: "provider_error", reason: "provider_unavailable" },
      });
    },
  );

  it("maps Firestore unavailability to a safe provider error", async () => {
    const unavailableReader: TrustedFirestoreReader = {
      getDocument: vi.fn().mockRejectedValue(new Error("raw Firestore outage")),
      listDocuments: vi.fn(),
    };
    const repositories =
      createTrustedSessionRepositoryAdapters(unavailableReader);
    const result =
      await createIdentitySessionResolutionService(
        repositories,
      ).resolveIdentity(identity);

    expect(result).toEqual({
      ok: false,
      failure: { category: "provider_error", reason: "provider_unavailable" },
    });
    expect(JSON.stringify(result)).not.toContain("raw Firestore outage");
  });
});
