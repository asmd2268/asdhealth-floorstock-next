import { describe, expect, it } from "vitest";

import { resolveScopedPermission } from "@/domain/access/permissions";

import { resolveSession, type SessionResolverInput } from "./session-resolver";
import type {
  PermissionOverrideRecord,
  RoleAssignmentRecord,
  UserProfileRecord,
} from "./types";

const identity = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "User One",
} as const;

const directory = {
  tenantId: "tenant-1",
  status: "active",
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [
    { id: "facility-1", organizationId: "organization-1" },
    { id: "facility-2", organizationId: "organization-1" },
  ],
  departments: [
    {
      id: "department-1",
      organizationId: "organization-1",
      facilityId: "facility-1",
    },
    {
      id: "department-2",
      organizationId: "organization-1",
      facilityId: "facility-2",
    },
  ],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: true,
    controlled_medicines: false,
  },
} as const;

const profile: UserProfileRecord = {
  uid: identity.uid,
  tenantId: directory.tenantId,
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
};

const facilityScope = {
  kind: "facility",
  platformId: directory.platformId,
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const assignment: RoleAssignmentRecord = {
  uid: identity.uid,
  tenantId: directory.tenantId,
  roleId: "pharmacy_manager",
  scope: facilityScope,
};

function input(
  overrides: Partial<SessionResolverInput> = {},
): SessionResolverInput {
  return {
    identity,
    profile,
    roleAssignments: [assignment],
    tenantDirectory: directory,
    ...overrides,
  };
}

function reason(result: ReturnType<typeof resolveSession>) {
  return result.ok ? null : result.failure.reason;
}

describe("session resolver", () => {
  it("returns a typed unauthenticated result when identity is absent", () => {
    expect(reason(resolveSession(input({ identity: null })))).toBe(
      "unauthenticated",
    );
  });

  it("denies a disabled user", () => {
    expect(
      reason(
        resolveSession(
          input({ profile: { ...profile, accountStatus: "disabled" } }),
        ),
      ),
    ).toBe("account_disabled");
  });

  it("denies an unknown role", () => {
    expect(
      reason(
        resolveSession(
          input({ roleAssignments: [{ ...assignment, roleId: "admin" }] }),
        ),
      ),
    ).toBe("unknown_role");
  });

  it("denies a tenant mismatch", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: { ...directory, tenantId: "tenant-2" },
          }),
        ),
      ),
    ).toBe("tenant_mismatch");
  });

  it("denies an inactive tenant", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: { ...directory, status: "inactive" },
          }),
        ),
      ),
    ).toBe("tenant_inactive");
  });

  it("denies a session when trusted tenant feature flags are missing", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: { ...directory, featureFlags: undefined },
          }),
        ),
      ),
    ).toBe("feature_flags_missing");
  });

  it("denies a session when trusted tenant feature flags are incomplete", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              featureFlags: { announcements: true },
            },
          }),
        ),
      ),
    ).toBe("feature_flags_missing");
  });

  it("denies an invalid active facility", () => {
    expect(
      reason(
        resolveSession(
          input({
            profile: { ...profile, activeFacilityId: "facility-2" },
          }),
        ),
      ),
    ).toBe("active_facility_invalid");
  });

  it("supports multiple facilities and deterministically selects one", () => {
    const result = resolveSession(
      input({
        profile: {
          ...profile,
          facilityIds: ["facility-2", "facility-1"],
          activeFacilityId: null,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.facilityIds).toEqual(["facility-1", "facility-2"]);
      expect(result.user.activeFacilityId).toBe("facility-1");
    }
  });

  it("uses a validated requested facility instead of the trusted default", () => {
    const secondScope = { ...facilityScope, facilityId: "facility-2" } as const;
    const result = resolveSession(
      input({
        requestedActiveFacilityId: "facility-2",
        profile: { ...profile, facilityIds: ["facility-2", "facility-1"] },
        roleAssignments: [assignment, { ...assignment, scope: secondScope }],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.activeFacilityId).toBe("facility-2");
      expect(result.user.activeScope).toEqual(secondScope);
    }
  });

  it("resolves only a trusted department membership in the active facility", () => {
    const result = resolveSession(
      input({
        profile: {
          ...profile,
          facilityIds: ["facility-1", "facility-2"],
          departmentIds: ["department-2", "department-1"],
          activeDepartmentId: "department-1",
        },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      user: {
        departmentIds: ["department-1", "department-2"],
        activeDepartmentId: "department-1",
      },
    });
  });

  it("fails closed for invalid or missing department-user membership", () => {
    const departmentAssignment = {
      ...assignment,
      roleId: "department_user",
    } as const;
    expect(
      reason(
        resolveSession(
          input({
            profile: {
              ...profile,
              departmentIds: ["department-2"],
              activeDepartmentId: "department-2",
            },
            roleAssignments: [departmentAssignment],
          }),
        ),
      ),
    ).toBe("department_mismatch");
    expect(
      reason(
        resolveSession(input({ roleAssignments: [departmentAssignment] })),
      ),
    ).toBe("active_department_invalid");
  });

  it("rejects a trusted default department outside the trusted default facility", () => {
    expect(
      reason(
        resolveSession(
          input({
            profile: {
              ...profile,
              facilityIds: ["facility-1", "facility-2"],
              departmentIds: ["department-1", "department-2"],
              activeDepartmentId: "department-2",
            },
          }),
        ),
      ),
    ).toBe("active_department_invalid");
  });

  it("selects an in-facility department when switching facilities", () => {
    const result = resolveSession(
      input({
        requestedActiveFacilityId: "facility-2",
        profile: {
          ...profile,
          facilityIds: ["facility-1", "facility-2"],
          departmentIds: ["department-1", "department-2"],
          activeDepartmentId: "department-1",
        },
        roleAssignments: [
          assignment,
          {
            ...assignment,
            roleId: "department_user",
            scope: { ...facilityScope, facilityId: "facility-2" },
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      user: {
        activeFacilityId: "facility-2",
        activeDepartmentId: "department-2",
      },
    });
  });

  it("rejects malformed department directories and duplicate memberships", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              departments: [directory.departments[0], directory.departments[0]],
            },
          }),
        ),
      ),
    ).toBe("department_mismatch");
    expect(
      reason(
        resolveSession(
          input({
            profile: {
              ...profile,
              departmentIds: ["department-1", "department-1"],
            },
          }),
        ),
      ),
    ).toBe("department_mismatch");
  });

  it("fails closed instead of falling back when a requested facility is stale", () => {
    expect(
      reason(
        resolveSession(
          input({
            requestedActiveFacilityId: "facility-2",
            profile: { ...profile, facilityIds: ["facility-1"] },
          }),
        ),
      ),
    ).toBe("active_facility_invalid");
  });

  it("rejects duplicate profile, organization, or facility identifiers", () => {
    expect(
      reason(
        resolveSession(
          input({
            profile: {
              ...profile,
              facilityIds: ["facility-1", "facility-1"],
            },
          }),
        ),
      ),
    ).toBe("facility_mismatch");
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              organizations: [
                directory.organizations[0],
                directory.organizations[0],
              ],
            },
          }),
        ),
      ),
    ).toBe("organization_mismatch");
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              facilities: [directory.facilities[0], directory.facilities[0]],
            },
          }),
        ),
      ),
    ).toBe("facility_mismatch");
  });

  it("uses locale-independent canonical ID ordering only when no trusted default exists", () => {
    const result = resolveSession(
      input({
        profile: {
          ...profile,
          activeFacilityId: null,
          facilityIds: ["facility-z", "facility-A", "facility-10"],
        },
        tenantDirectory: {
          ...directory,
          departments: [],
          facilities: ["facility-z", "facility-A", "facility-10"].map((id) => ({
            id,
            organizationId: "organization-1",
          })),
        },
        roleAssignments: [
          {
            ...assignment,
            scope: {
              kind: "organization",
              platformId: "platform-1",
              organizationId: "organization-1",
            },
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      user: { activeFacilityId: "facility-10" },
    });
  });

  it("rejects a facility whose parent organization is missing", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              organizations: [],
            },
          }),
        ),
      ),
    ).toBe("organization_mismatch");
  });

  it("retains multiple facility-scoped role assignments", () => {
    const secondScope = { ...facilityScope, facilityId: "facility-2" } as const;
    const result = resolveSession(
      input({
        profile: { ...profile, facilityIds: ["facility-1", "facility-2"] },
        roleAssignments: [
          assignment,
          { ...assignment, roleId: "department_user", scope: secondScope },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.roleAssignments).toEqual([
        { role: "pharmacy_manager", scope: facilityScope },
        { role: "department_user", scope: secondScope },
      ]);
      expect(
        resolveScopedPermission({
          roleAssignments: result.user.roleAssignments,
          resource: "new_request",
          action: "read",
          subjectScope: secondScope,
          targetScope: secondScope,
          featureFlags: { new_request: true },
        }).allowed,
      ).toBe(true);
      expect(
        resolveScopedPermission({
          roleAssignments: result.user.roleAssignments,
          resource: "new_request",
          action: "read",
          subjectScope: facilityScope,
          targetScope: facilityScope,
          featureFlags: { new_request: true },
        }).allowed,
      ).toBe(false);
    }
  });

  it("preserves explicit allow and explicit deny precedence", () => {
    const allow: PermissionOverrideRecord = {
      effect: "allow",
      resource: "announcements",
      action: "read",
      scope: facilityScope,
    };
    const deny: PermissionOverrideRecord = { ...allow, effect: "deny" };
    const result = resolveSession(
      input({
        profile: {
          ...profile,
          explicitPermissionOverrides: [allow, deny],
        },
        roleAssignments: [
          { ...assignment, roleId: "external_pharmacy_supervisor" },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        resolveScopedPermission({
          roleAssignments: result.user.roleAssignments,
          resource: "announcements",
          action: "read",
          subjectScope: result.user.activeScope,
          targetScope: result.user.activeScope,
          featureFlags: { announcements: true },
          overrides: result.user.explicitPermissionOverrides,
        }),
      ).toEqual({ allowed: false, reason: "explicit_deny" });
    }
  });

  it("allows a valid scoped explicit allow", () => {
    const result = resolveSession(
      input({
        profile: {
          ...profile,
          explicitPermissionOverrides: [
            {
              effect: "allow",
              resource: "announcements",
              action: "read",
              scope: facilityScope,
            },
          ],
        },
        roleAssignments: [
          { ...assignment, roleId: "external_pharmacy_supervisor" },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        resolveScopedPermission({
          roleAssignments: result.user.roleAssignments,
          resource: "announcements",
          action: "read",
          subjectScope: result.user.activeScope,
          targetScope: result.user.activeScope,
          featureFlags: { announcements: true },
          overrides: result.user.explicitPermissionOverrides,
        }),
      ).toEqual({ allowed: true, reason: "explicit_allow" });
    }
  });

  it("denies missing required profile data", () => {
    expect(
      reason(resolveSession(input({ profile: { uid: identity.uid } }))),
    ).toBe("profile_incomplete");
  });

  it("denies facility membership that crosses organizations", () => {
    expect(
      reason(
        resolveSession(
          input({
            tenantDirectory: {
              ...directory,
              organizations: [
                ...directory.organizations,
                { id: "organization-2" },
              ],
              facilities: [
                { id: "facility-1", organizationId: "organization-2" },
              ],
              departments: [],
            },
          }),
        ),
      ),
    ).toBe("facility_mismatch");
  });
});
