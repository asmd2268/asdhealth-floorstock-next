import { describe, expect, it } from "vitest";

import { resourceIds } from "@/domain/access/types";

import {
  getVisibleNavigation,
  navigationItemIds,
  navigationItems,
} from "./navigation";

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
  it("requires permission metadata on every declared navigation item", () => {
    expect(navigationItems.map((item) => item.id)).toEqual(navigationItemIds);
    for (const item of navigationItems) {
      expect(resourceIds).toContain(item.resource);
      expect(item.action).toBe("read");
    }
  });

  it("uses one canonical target for every href and rendered section", () => {
    for (const item of navigationItems) {
      expect(item.href).toBe(`#${item.targetId}`);
      expect(item.targetId).toBe(item.id.replaceAll("_", "-"));
    }
  });

  it("shows pharmacy modules without new request to pharmacy roles", () => {
    expect(idsFor("pharmacy_manager")).toEqual([
      "dashboard",
      "announcements",
      "zebra_labels",
    ]);
    expect(idsFor("master")).not.toContain("new_request");
  });

  it("shows dashboard and new request to department users", () => {
    expect(idsFor("department_user")).toEqual(["dashboard", "new_request"]);
  });

  it("shows no navigation to the external pharmacy supervisor", () => {
    expect(idsFor("external_pharmacy_supervisor")).toEqual([]);
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

  it("resolves dashboard through explicit permission metadata", () => {
    const dashboard = navigationItems.find((item) => item.id === "dashboard");
    expect(dashboard).toMatchObject({ resource: "dashboard", action: "read" });

    const denied = getVisibleNavigation({
      role: "external_pharmacy_supervisor",
      subjectScope: scope,
      targetScope: scope,
      featureFlags,
      overrides: [{ effect: "deny", resource: "dashboard", action: "read" }],
    });
    expect(denied).toEqual([]);
  });
});
