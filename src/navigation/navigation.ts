import { canAccessFeature } from "@/domain/access/permissions";
import type { PermissionOverride, RoleId } from "@/domain/access/types";
import type {
  FeatureFlagSet,
  FeatureId,
  UserScope,
} from "@/domain/platform/types";

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
  href: string;
  feature?: FeatureId;
}

export const navigationItems: readonly NavigationItem[] = [
  { id: "dashboard", href: "#dashboard" },
  { id: "announcements", href: "#announcements", feature: "announcements" },
  { id: "zebra_labels", href: "#zebra-labels", feature: "zebra_labels" },
  { id: "new_request", href: "#new-request", feature: "new_request" },
  {
    id: "controlled_medicines",
    href: "#controlled-medicines",
    feature: "controlled_medicines",
  },
];

export interface NavigationContext {
  role: RoleId;
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
      !item.feature ||
      canAccessFeature({
        role: context.role,
        feature: item.feature,
        subjectScope: context.subjectScope,
        targetScope: context.targetScope,
        featureFlags: context.featureFlags,
        overrides: context.overrides,
      }),
  );
}
