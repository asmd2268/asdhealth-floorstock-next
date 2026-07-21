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
  platformId: "platform-1",
  organizations: [{ id: "organization-1" }],
  facilities: [
    { id: "facility-1", organizationId: "organization-1" },
    { id: "facility-2", organizationId: "organization-1" },
  ],
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
            },
          }),
        ),
      ),
    ).toBe("facility_mismatch");
  });
});
