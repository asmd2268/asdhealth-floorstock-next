import { describe, expect, it } from "vitest";

import type { AdministratorPrincipal } from "@/domain/provisioning/types";
import {
  canReadAdministration,
  canReadFeatures,
  filterDirectory,
  isProfileVisible,
} from "./authorization";

const owner: AdministratorPrincipal = {
  kind: "platform_owner",
  uid: "owner",
  platformId: "platform-1",
};
const unrestricted: AdministratorPrincipal = {
  kind: "tenant_admin",
  scope: "unrestricted",
  uid: "admin",
  platformId: "platform-1",
  tenantId: "tenant-1",
};
const restricted: AdministratorPrincipal = {
  kind: "tenant_admin",
  scope: "restricted",
  uid: "admin-r",
  platformId: "platform-1",
  tenantId: "tenant-1",
  organizationIds: ["org-1"],
  facilityIds: ["fac-1"],
};
const directory = {
  tenantId: "tenant-1",
  platformId: "platform-1",
  status: "active" as const,
  organizations: [{ id: "org-1" }, { id: "org-2" }],
  facilities: [
    { id: "fac-1", organizationId: "org-1" },
    { id: "fac-2", organizationId: "org-2" },
  ],
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
  },
};

describe("administration read authorization", () => {
  it("binds all principals to the active platform and tenant", () => {
    expect(canReadAdministration(owner, "tenant-1", "platform-1")).toBe(true);
    expect(canReadAdministration(owner, "tenant-1", "platform-2")).toBe(false);
    expect(canReadAdministration(unrestricted, "tenant-1", "platform-1")).toBe(
      true,
    );
    expect(canReadAdministration(unrestricted, "tenant-2", "platform-1")).toBe(
      false,
    );
  });

  it("permits feature management only to owners and unrestricted tenant administrators", () => {
    expect(canReadFeatures(owner, "tenant-1", "platform-1")).toBe(true);
    expect(canReadFeatures(unrestricted, "tenant-1", "platform-1")).toBe(true);
    expect(canReadFeatures(restricted, "tenant-1", "platform-1")).toBe(false);
  });

  it("filters restricted directory and user scope without broadening partial membership", () => {
    expect(filterDirectory(restricted, directory)).toEqual({
      organizations: [{ id: "org-1" }],
      facilities: [{ id: "fac-1", organizationId: "org-1" }],
    });
    expect(
      isProfileVisible(restricted, {
        tenantId: "tenant-1",
        organizationId: "org-1",
        facilityIds: ["fac-1"],
      }),
    ).toBe(true);
    expect(
      isProfileVisible(restricted, {
        tenantId: "tenant-1",
        organizationId: "org-1",
        facilityIds: ["fac-1", "fac-2"],
      }),
    ).toBe(false);
    expect(
      isProfileVisible(restricted, {
        tenantId: "tenant-2",
        organizationId: "org-1",
        facilityIds: ["fac-1"],
      }),
    ).toBe(false);
  });
});
