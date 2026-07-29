import { describe, expect, it } from "vitest";

import type { SessionResolutionResult } from "@/domain/auth/types";

import { fingerprintTrustedAuthorization } from "./trusted-authorization";

const scope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const trusted: Extract<SessionResolutionResult, { ok: true }> = {
  ok: true,
  user: {
    uid: "user-1",
    email: null,
    displayName: null,
    tenantId: "tenant-1",
    platformId: "platform-1",
    organizationId: "organization-1",
    facilityIds: ["facility-1"],
    activeFacilityId: "facility-1",
    departmentIds: ["department-1"],
    activeDepartmentId: "department-1",
    activeScope: scope,
    roleAssignments: [{ role: "department_user", scope }],
    explicitPermissionOverrides: [],
    accountStatus: "active",
  },
  featureFlags: {
    announcements: true,
    zebra_labels: false,
    new_request: true,
    controlled_medicines: false,
    inventory: false,
  },
};

describe("trusted authorization fingerprint", () => {
  it("changes when department authority changes and ignores membership order", () => {
    const baseline = fingerprintTrustedAuthorization(trusted);
    expect(
      fingerprintTrustedAuthorization({
        ...trusted,
        user: {
          ...trusted.user,
          departmentIds: ["department-2", "department-1"],
        },
      }),
    ).not.toBe(baseline);
    expect(
      fingerprintTrustedAuthorization({
        ...trusted,
        user: {
          ...trusted.user,
          departmentIds: ["department-1", "department-2"],
        },
      }),
    ).toBe(
      fingerprintTrustedAuthorization({
        ...trusted,
        user: {
          ...trusted.user,
          departmentIds: ["department-2", "department-1"],
        },
      }),
    );
    expect(
      fingerprintTrustedAuthorization({
        ...trusted,
        user: { ...trusted.user, activeDepartmentId: null },
      }),
    ).not.toBe(baseline);
  });
});
