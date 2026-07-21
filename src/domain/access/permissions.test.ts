import { describe, expect, it } from "vitest";

import { can, canAccessFeature, resolvePermission } from "./permissions";
import { roleIds, type PermissionRequest, type RoleId } from "./types";

const facilityScope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const organizationScope = {
  kind: "organization",
  platformId: "platform-1",
  organizationId: "organization-1",
} as const;

const platformScope = {
  kind: "platform",
  platformId: "platform-1",
} as const;

const baseRequest: PermissionRequest = {
  role: "pharmacy_manager",
  resource: "announcements",
  action: "read",
  subjectScope: facilityScope,
  targetScope: facilityScope,
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
          featureFlags: { zebra_labels: true },
        }),
      ).toBe(true);
    },
  );

  it.each(["warehouse_manager", "department_user"] as const)(
    "denies Zebra labels for %s by default",
    (role) => {
      expect(
        can({
          ...baseRequest,
          role,
          resource: "zebra_labels",
          featureFlags: { zebra_labels: true },
        }),
      ).toBe(false);
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
          featureFlags: { new_request: true },
        }),
      ).toBe(true);
    }
  });

  it("gives external pharmacy supervisors no access by default", () => {
    expect(
      can({
        ...baseRequest,
        role: "external_pharmacy_supervisor",
        resource: "dashboard",
        featureFlags: {},
      }),
    ).toBe(false);

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

  it("derives the feature and denies when its flag is disabled", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        featureFlags: { announcements: false },
      }),
    ).toEqual({ allowed: false, reason: "feature_disabled" });
  });

  it("denies feature-backed resources when feature flags are missing", () => {
    expect(
      resolvePermission({ ...baseRequest, featureFlags: undefined }),
    ).toEqual({
      allowed: false,
      reason: "feature_disabled",
    });
  });

  it.each([
    ["announcements", "pharmacy_manager"],
    ["zebra_labels", "pharmacy_manager"],
    ["new_request", "department_user"],
    ["controlled_medicines", "master"],
  ] as const)(
    "gates %s through its canonical feature flag",
    (resource, role) => {
      expect(
        resolvePermission({
          ...baseRequest,
          resource,
          role,
          featureFlags: { [resource]: false },
          overrides: [{ effect: "allow", resource, action: "read" }],
        }),
      ).toEqual({ allowed: false, reason: "feature_disabled" });
    },
  );

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

  it("allows a platform scope to reach facilities in its platform", () => {
    expect(
      can({
        ...baseRequest,
        subjectScope: platformScope,
        targetScope: {
          ...facilityScope,
          organizationId: "organization-2",
          facilityId: "facility-2",
        },
      }),
    ).toBe(true);
  });

  it("allows an organization scope to reach its facilities", () => {
    expect(
      can({
        ...baseRequest,
        subjectScope: organizationScope,
      }),
    ).toBe(true);
  });

  it("denies cross-platform access", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        subjectScope: platformScope,
        targetScope: { ...facilityScope, platformId: "platform-2" },
      }),
    ).toEqual({ allowed: false, reason: "scope_mismatch" });
  });

  it("denies facility-to-organization escalation", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        targetScope: organizationScope,
      }),
    ).toEqual({ allowed: false, reason: "scope_mismatch" });
  });

  it("applies explicit allows only within their configured scope", () => {
    const override = {
      effect: "allow",
      resource: "announcements",
      action: "read",
      scope: facilityScope,
    } as const;

    expect(
      resolvePermission({
        ...baseRequest,
        role: "warehouse_manager",
        subjectScope: organizationScope,
        overrides: [override],
      }).reason,
    ).toBe("explicit_allow");

    expect(
      resolvePermission({
        ...baseRequest,
        role: "warehouse_manager",
        subjectScope: organizationScope,
        targetScope: { ...facilityScope, facilityId: "facility-2" },
        overrides: [override],
      }).reason,
    ).toBe("default_deny");
  });

  it("applies scoped denies before scoped allows", () => {
    expect(
      resolvePermission({
        ...baseRequest,
        subjectScope: organizationScope,
        overrides: [
          {
            effect: "allow",
            resource: "announcements",
            action: "read",
            scope: facilityScope,
          },
          {
            effect: "deny",
            resource: "announcements",
            action: "read",
            scope: facilityScope,
          },
        ],
      }),
    ).toEqual({ allowed: false, reason: "explicit_deny" });
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
