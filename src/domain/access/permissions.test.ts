import { describe, expect, it } from "vitest";

import { can, canAccessFeature, resolvePermission } from "./permissions";
import { roleIds, type PermissionRequest, type RoleId } from "./types";

const facilityScope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const baseRequest: PermissionRequest = {
  role: "pharmacy_manager",
  resource: "announcements",
  action: "read",
  subjectScope: facilityScope,
  targetScope: facilityScope,
  feature: "announcements",
  featureFlags: { announcements: true },
};

const pharmacyFeatureRoles: readonly RoleId[] = [
  "master",
  "pharmacy_manager",
  "pharmacy_supervisor",
  "pharmacy_staff",
  "controlled_drugs_officer",
];

describe("permission resolution", () => {
  it.each(pharmacyFeatureRoles)(
    "allows announcements for %s by default",
    (role) => {
      expect(can({ ...baseRequest, role })).toBe(true);
    },
  );

  it.each([
    "warehouse_manager",
    "department_user",
    "external_pharmacy_supervisor",
  ] as const)("denies announcements for %s by default", (role) => {
    expect(can({ ...baseRequest, role })).toBe(false);
  });

  it.each(pharmacyFeatureRoles)(
    "allows Zebra labels for %s by default",
    (role) => {
      expect(
        can({
          ...baseRequest,
          role,
          resource: "zebra_labels",
          feature: "zebra_labels",
          featureFlags: { zebra_labels: true },
        }),
      ).toBe(true);
    },
  );

  it.each(roleIds.filter((role) => role !== "department_user"))(
    "hides new request from %s by default",
    (role) => {
      expect(
        can({
          ...baseRequest,
          role,
          resource: "new_request",
          feature: "new_request",
          featureFlags: { new_request: true },
        }),
      ).toBe(false);
    },
  );

  it("allows department users to read and create new requests", () => {
    for (const action of ["read", "create"] as const) {
      expect(
        can({
          ...baseRequest,
          role: "department_user",
          resource: "new_request",
          action,
          feature: "new_request",
          featureFlags: { new_request: true },
        }),
      ).toBe(true);
    }
  });

  it("gives external pharmacy supervisors no feature access by default", () => {
    for (const feature of [
      "announcements",
      "zebra_labels",
      "new_request",
      "controlled_medicines",
    ] as const) {
      expect(
        canAccessFeature({
          role: "external_pharmacy_supervisor",
          feature,
          subjectScope: facilityScope,
          targetScope: facilityScope,
          featureFlags: { [feature]: true },
        }),
      ).toBe(false);
    }
  });

  it("supports an explicit allow over a missing role default", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        role: "warehouse_manager",
        overrides: [
          { effect: "allow", resource: "announcements", action: "read" },
        ],
      }),
    ).toEqual({ allowed: true, reason: "explicit_allow" });
  });

  it("gives an explicit deny precedence over both allow and role defaults", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        overrides: [
          { effect: "allow", resource: "announcements", action: "read" },
          { effect: "deny", resource: "announcements", action: "read" },
        ],
      }),
    ).toEqual({ allowed: false, reason: "explicit_deny" });
  });

  it("does not let overrides bypass a disabled feature", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        role: "warehouse_manager",
        featureFlags: { announcements: false },
        overrides: [
          { effect: "allow", resource: "announcements", action: "read" },
        ],
      }),
    ).toEqual({ allowed: false, reason: "feature_disabled" });
  });

  it("does not let overrides bypass tenant or facility scope", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        targetScope: { ...facilityScope, facilityId: "facility-2" },
        overrides: [
          { effect: "allow", resource: "announcements", action: "read" },
        ],
      }),
    ).toEqual({ allowed: false, reason: "scope_mismatch" });
  });

  it("denies unconfigured actions and controlled medicine access", () => {
    expect(
      resolvePermission({ ...baseRequest, action: "approve" }).reason,
    ).toBe("default_deny");
    expect(
      canAccessFeature({
        role: "master",
        feature: "controlled_medicines",
        subjectScope: facilityScope,
        targetScope: facilityScope,
        featureFlags: { controlled_medicines: true },
      }),
    ).toBe(false);
  });
});
