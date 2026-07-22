import { describe, expect, it } from "vitest";

import { canAdministratorPerform } from "./authorization";

const platformOwner = {
  kind: "platform_owner",
  uid: "owner-1",
  platformId: "platform-1",
} as const;
const tenantAdministrator = {
  kind: "tenant_admin",
  scope: "restricted",
  uid: "admin-1",
  platformId: "platform-1",
  tenantId: "tenant-1",
  organizationIds: ["organization-1"],
  facilityIds: ["facility-1"],
} as const;
const unrestrictedTenantAdministrator = {
  kind: "tenant_admin",
  scope: "unrestricted",
  uid: "admin-unrestricted",
  platformId: "platform-1",
  tenantId: "tenant-1",
} as const;

describe("administrator action defaults", () => {
  it("allows platform owners within their platform", () => {
    expect(
      canAdministratorPerform(platformOwner, "create_tenant", {
        tenantId: "tenant-new",
        platformId: "platform-1",
      }),
    ).toBe(true);
  });

  it("allows tenant administrators only approved same-tenant actions", () => {
    expect(
      canAdministratorPerform(tenantAdministrator, "upsert_facility", {
        tenantId: "tenant-1",
        platformId: "platform-1",
      }),
    ).toBe(true);
    expect(
      canAdministratorPerform(tenantAdministrator, "create_tenant", {
        tenantId: "tenant-1",
        platformId: "platform-1",
      }),
    ).toBe(false);
    expect(
      canAdministratorPerform(tenantAdministrator, "replace_feature_flags", {
        tenantId: "tenant-1",
        platformId: "platform-1",
      }),
    ).toBe(false);
    expect(
      canAdministratorPerform(
        unrestrictedTenantAdministrator,
        "replace_feature_flags",
        {
          tenantId: "tenant-1",
          platformId: "platform-1",
        },
      ),
    ).toBe(true);
    expect(
      canAdministratorPerform(tenantAdministrator, "replace_feature_flags", {
        tenantId: "tenant-other",
        platformId: "platform-1",
      }),
    ).toBe(false);
  });

  it("denies cross-platform operations", () => {
    expect(
      canAdministratorPerform(platformOwner, "upsert_user_profile", {
        tenantId: "tenant-1",
        platformId: "platform-other",
      }),
    ).toBe(false);
  });
});
