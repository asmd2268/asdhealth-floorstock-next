import { describe, expect, it } from "vitest";

import {
  administrationAccountStatusSchema,
  administrationFeatureFlagsSchema,
  administrationMembershipSchema,
  administrationRoleSchema,
} from "./route-schemas";

const flags = {
  announcements: true,
  zebra_labels: false,
  new_request: false,
  controlled_medicines: false,
};

describe("administration mutation schemas", () => {
  it("rejects client-selected tenant, platform, actor, and audit authority", () => {
    for (const authority of [
      { tenantId: "tenant-other" },
      { platformId: "platform-other" },
      { actor: "owner" },
      { auditMetadata: { note: "client-controlled" } },
    ]) {
      expect(
        administrationAccountStatusSchema.safeParse({
          accountStatus: "active",
          ...authority,
        }).success,
      ).toBe(false);
    }
  });

  it("requires complete current and expected feature sets and rejects unknown flags", () => {
    expect(
      administrationFeatureFlagsSchema.safeParse({
        featureFlags: flags,
        expectedFeatureFlags: flags,
      }).success,
    ).toBe(true);
    for (const value of [
      { featureFlags: flags },
      { expectedFeatureFlags: flags },
      {
        featureFlags: { ...flags, unknown: true },
        expectedFeatureFlags: flags,
      },
      {
        featureFlags: flags,
        expectedFeatureFlags: { announcements: true },
      },
    ]) {
      expect(administrationFeatureFlagsSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });

  it("rejects unknown roles and invalid membership relationships at the boundary", () => {
    expect(
      administrationRoleSchema.safeParse({
        roleId: "administrator",
        scope: { kind: "platform", platformId: "platform-1" },
      }).success,
    ).toBe(false);
    expect(
      administrationMembershipSchema.safeParse({
        organizationId: "org-1",
        facilityIds: [],
        activeFacilityId: "fac-1",
      }).success,
    ).toBe(false);
  });
});
