import type { FeatureFlagSet, UserScope } from "@/domain/platform/types";

export const roleIds = [
  "master",
  "pharmacy_manager",
  "pharmacy_supervisor",
  "pharmacy_staff",
  "controlled_drugs_officer",
  "warehouse_manager",
  "department_user",
  "external_pharmacy_supervisor",
] as const;

export type RoleId = (typeof roleIds)[number];

export const permissionActions = [
  "read",
  "create",
  "edit",
  "delete",
  "approve",
] as const;

export type PermissionAction = (typeof permissionActions)[number];

export const resourceIds = [
  "dashboard",
  "announcements",
  "zebra_labels",
  "new_request",
  "controlled_medicines",
] as const;

export type ResourceId = (typeof resourceIds)[number];

export type PermissionEffect = "allow" | "deny";

export interface PermissionOverride {
  effect: PermissionEffect;
  resource: ResourceId;
  action: PermissionAction;
  scope?: UserScope;
}

export interface PermissionRequest {
  role: RoleId;
  resource: ResourceId;
  action: PermissionAction;
  subjectScope: UserScope;
  targetScope: UserScope;
  featureFlags?: FeatureFlagSet;
  overrides?: readonly PermissionOverride[];
}

export type PermissionReason =
  | "explicit_deny"
  | "explicit_allow"
  | "role_default"
  | "feature_disabled"
  | "scope_mismatch"
  | "default_deny";

export interface PermissionDecision {
  allowed: boolean;
  reason: PermissionReason;
}
