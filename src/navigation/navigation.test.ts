import { describe, expect, it } from "vitest";

import { getVisibleNavigation } from "./navigation";

const scope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const featureFlags = {
  announcements: true,
  zebra_labels: true,
  new_request: true,
  controlled_medicines: false,
} as const;

function idsFor(role: Parameters<typeof getVisibleNavigation>[0]["role"]) {
  return getVisibleNavigation({
    role,
    subjectScope: scope,
    targetScope: scope,
    featureFlags,
  }).map((item) => item.id);
}

describe("navigation visibility", () => {
  it("shows pharmacy modules without new request to pharmacy roles", () => {
    expect(idsFor("pharmacy_manager")).toEqual([
      "dashboard",
      "announcements",
      "zebra_labels",
    ]);
    expect(idsFor("master")).not.toContain("new_request");
  });

  it("shows only dashboard and new request to department users", () => {
    expect(idsFor("department_user")).toEqual(["dashboard", "new_request"]);
  });

  it("shows no feature navigation to the external pharmacy supervisor", () => {
    expect(idsFor("external_pharmacy_supervisor")).toEqual(["dashboard"]);
  });

  it("applies feature flags before rendering an otherwise allowed module", () => {
    const visible = getVisibleNavigation({
      role: "pharmacy_manager",
      subjectScope: scope,
      targetScope: scope,
      featureFlags: { ...featureFlags, announcements: false },
    });

    expect(visible.map((item) => item.id)).not.toContain("announcements");
  });
});
