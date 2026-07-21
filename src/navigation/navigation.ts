import { resolveScopedPermission } from "@/domain/access/permissions";
import type {
  PermissionAction,
  PermissionOverride,
  ResourceId,
  ScopedRoleAssignment,
} from "@/domain/access/types";
import type { FeatureFlagSet, UserScope } from "@/domain/platform/types";

export const navigationItemIds = [
  "dashboard",
  "announcements",
  "zebra_labels",
  "new_request",
  "controlled_medicines",
] as const;

export type NavigationItemId = (typeof navigationItemIds)[number];

export interface NavigationItem {
  id: NavigationItemId;
  targetId: string;
  href: `#${string}`;
  resource: ResourceId;
  action: PermissionAction;
}

function navigationItem(
  id: NavigationItemId,
  resource: ResourceId,
  action: PermissionAction = "read",
): NavigationItem {
  const targetId = id.replaceAll("_", "-");
  return { id, targetId, href: `#${targetId}`, resource, action };
}

export const navigationItems: readonly NavigationItem[] = [
  navigationItem("dashboard", "dashboard"),
  navigationItem("announcements", "announcements"),
  navigationItem("zebra_labels", "zebra_labels"),
  navigationItem("new_request", "new_request"),
  navigationItem("controlled_medicines", "controlled_medicines"),
];

export interface NavigationContext {
  roleAssignments: readonly ScopedRoleAssignment[];
  subjectScope: UserScope;
  targetScope: UserScope;
  featureFlags: FeatureFlagSet;
  overrides?: readonly PermissionOverride[];
}

export function getVisibleNavigation(
  context: NavigationContext,
): readonly NavigationItem[] {
  return navigationItems.filter(
    (item) =>
      resolveScopedPermission({
        roleAssignments: context.roleAssignments,
        resource: item.resource,
        action: item.action,
        subjectScope: context.subjectScope,
        targetScope: context.targetScope,
        featureFlags: context.featureFlags,
        overrides: context.overrides,
      }).allowed,
  );
}
