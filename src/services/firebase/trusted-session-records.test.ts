import { describe, expect, it } from "vitest";

import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "./trusted-session-records";

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
  },
} as const;

describe("trusted session record validation", () => {
  it("normalizes a complete valid user profile", () => {
    expect(parseTrustedUserProfile(validProfileDocument)).toEqual(
      validProfileDocument,
    );
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

  it("normalizes a complete tenant directory", () => {
    expect(parseTrustedTenantDirectory(validTenantDocument)).toEqual(
      validTenantDocument,
    );
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
});
