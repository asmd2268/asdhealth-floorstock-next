import { describe, expect, it } from "vitest";

import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "./trusted-session-records";
import { trustedSessionLimits } from "./trusted-session-limits";

export const validProfileDocument = {
  uid: "user-1",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  facilityIds: ["facility-1"],
  activeFacilityId: "facility-1",
  accountStatus: "active",
  explicitPermissionOverrides: [],
} as const;

export const validAssignmentDocument = {
  uid: "user-1",
  tenantId: "tenant-1",
  roleId: "pharmacy_manager",
  scope: {
    kind: "facility",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityId: "facility-1",
  },
} as const;

export const validTenantDocument = {
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
} as const;

describe("trusted session record validation", () => {
  it("normalizes a complete valid user profile", () => {
    expect(parseTrustedUserProfile(validProfileDocument)).toEqual({
      ...validProfileDocument,
      departmentIds: [],
      activeDepartmentId: null,
    });
  });

  it("preserves disabled account status for fail-closed session resolution", () => {
    expect(
      parseTrustedUserProfile({
        ...validProfileDocument,
        accountStatus: "disabled",
      }).accountStatus,
    ).toBe("disabled");
  });

  it.each([
    { ...validProfileDocument, tenantId: undefined },
    { ...validProfileDocument, facilityIds: [] },
    { ...validProfileDocument, facilityIds: ["facility-1", "facility-1"] },
    { ...validProfileDocument, accountStatus: "enabled" },
    { ...validProfileDocument, role: "master" },
    { ...validProfileDocument, customClaims: { role: "master" } },
  ])("rejects malformed or client-invented profile data", (document) => {
    expect(() => parseTrustedUserProfile(document)).toThrow();
  });

  it("enforces bounded profile collections", () => {
    const facilityIds = Array.from(
      { length: trustedSessionLimits.facilityMemberships + 1 },
      (_, index) => "facility-" + index,
    );
    const explicitPermissionOverrides = Array.from(
      { length: trustedSessionLimits.explicitPermissionOverrides + 1 },
      () => ({
        effect: "allow" as const,
        resource: "dashboard" as const,
        action: "read" as const,
        scope: {
          kind: "facility" as const,
          platformId: "platform-1",
          organizationId: "organization-1",
          facilityId: "facility-1",
        },
      }),
    );

    expect(() =>
      parseTrustedUserProfile({ ...validProfileDocument, facilityIds }),
    ).toThrow();
    expect(() =>
      parseTrustedUserProfile({
        ...validProfileDocument,
        explicitPermissionOverrides,
      }),
    ).toThrow();
  });

  it("normalizes a valid scoped role assignment", () => {
    expect(parseTrustedRoleAssignment(validAssignmentDocument)).toEqual(
      validAssignmentDocument,
    );
  });

  it.each([
    { ...validAssignmentDocument, roleId: "admin" },
    { ...validAssignmentDocument, uid: "" },
    {
      ...validAssignmentDocument,
      scope: { ...validAssignmentDocument.scope, kind: "unknown" },
    },
    { ...validAssignmentDocument, claims: { role: "master" } },
  ])("rejects unknown or malformed role assignment data", (document) => {
    expect(() => parseTrustedRoleAssignment(document)).toThrow();
  });

  it.each([
    " tenant-1",
    "tenant-1 ",
    "tenant/path",
    "tenant\\path",
    "tenant\u0000one",
    "tenant\none",
    "tenant\u200Bone",
    "tenant／one",
    "مستأجر-1",
  ])("rejects non-canonical trusted identifier %j", (tenantId) => {
    expect(() =>
      parseTrustedRoleAssignment({ ...validAssignmentDocument, tenantId }),
    ).toThrow();
  });

  it("normalizes a complete tenant directory", () => {
    expect(parseTrustedTenantDirectory(validTenantDocument)).toEqual({
      ...validTenantDocument,
      departments: [],
    });
  });

  it("validates department parents and active membership", () => {
    const department = {
      id: "department-1",
      organizationId: "organization-1",
      facilityId: "facility-1",
      displayName: "Emergency",
    };
    expect(
      parseTrustedTenantDirectory({
        ...validTenantDocument,
        departments: [department],
      }).departments,
    ).toEqual([department]);
    expect(
      parseTrustedUserProfile({
        ...validProfileDocument,
        departmentIds: [department.id],
        activeDepartmentId: department.id,
      }),
    ).toMatchObject({
      departmentIds: [department.id],
      activeDepartmentId: department.id,
    });
    expect(() =>
      parseTrustedTenantDirectory({
        ...validTenantDocument,
        departments: [{ ...department, facilityId: "facility-missing" }],
      }),
    ).toThrow();
    expect(() =>
      parseTrustedUserProfile({
        ...validProfileDocument,
        departmentIds: [],
        activeDepartmentId: department.id,
      }),
    ).toThrow();
  });

  it("accepts a bounded safe facility display name and rejects unsafe labels", () => {
    expect(
      parseTrustedTenantDirectory({
        ...validTenantDocument,
        facilities: [
          {
            ...validTenantDocument.facilities[0],
            displayName: "Central Hospital",
          },
        ],
      }).facilities[0].displayName,
    ).toBe("Central Hospital");
    for (const displayName of [
      " Hospital",
      "Hospital\nNorth",
      "Hospital\u202ENorth",
      "x".repeat(121),
    ]) {
      expect(() =>
        parseTrustedTenantDirectory({
          ...validTenantDocument,
          facilities: [{ ...validTenantDocument.facilities[0], displayName }],
        }),
      ).toThrow();
    }
  });

  it("preserves inactive tenant status for fail-closed session resolution", () => {
    expect(
      parseTrustedTenantDirectory({
        ...validTenantDocument,
        status: "inactive",
      }).status,
    ).toBe("inactive");
  });

  it.each([
    {
      ...validTenantDocument,
      featureFlags: { announcements: true },
    },
    {
      ...validTenantDocument,
      featureFlags: {
        ...validTenantDocument.featureFlags,
        zebra_labels: "true",
      },
    },
    {
      ...validTenantDocument,
      featureFlags: {
        ...validTenantDocument.featureFlags,
        invented_feature: true,
      },
    },
    {
      ...validTenantDocument,
      facilities: [{ id: "facility-1", organizationId: "other-organization" }],
    },
  ])("rejects malformed tenant or feature-flag data", (document) => {
    expect(() => parseTrustedTenantDirectory(document)).toThrow();
  });

  it("enforces bounded tenant directory collections", () => {
    const organizations = Array.from(
      { length: trustedSessionLimits.tenantOrganizations + 1 },
      (_, index) => ({ id: "organization-" + index }),
    );
    const facilities = Array.from(
      { length: trustedSessionLimits.tenantFacilities + 1 },
      (_, index) => ({
        id: "facility-" + index,
        organizationId: "organization-1",
      }),
    );

    expect(() =>
      parseTrustedTenantDirectory({
        ...validTenantDocument,
        organizations,
      }),
    ).toThrow();
    expect(() =>
      parseTrustedTenantDirectory({ ...validTenantDocument, facilities }),
    ).toThrow();
  });
});
