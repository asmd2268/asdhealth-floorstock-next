import type { FeatureId, UserScope } from "@/domain/platform/types";

import type {
  PermissionAction,
  PermissionDecision,
  PermissionOverride,
  PermissionRequest,
  ResourceId,
  RoleId,
  ScopedPermissionRequest,
} from "./types";

type RoleDefaults = Readonly<
  Partial<
    Record<
      RoleId,
      Readonly<Partial<Record<ResourceId, readonly PermissionAction[]>>>
    >
  >
>;

export const featureResources: Readonly<Record<FeatureId, ResourceId>> = {
  announcements: "announcements",
  zebra_labels: "zebra_labels",
  new_request: "new_request",
  controlled_medicines: "controlled_medicines",
};

export const resourceFeatures: Readonly<Record<ResourceId, FeatureId | null>> =
  {
    dashboard: null,
    announcements: "announcements",
    zebra_labels: "zebra_labels",
    new_request: "new_request",
    controlled_medicines: "controlled_medicines",
  };

const sharedPharmacyRoles = [
  "master",
  "pharmacy_manager",
  "pharmacy_supervisor",
  "pharmacy_staff",
  "controlled_drugs_officer",
] as const satisfies readonly RoleId[];

const dashboardRoles = [
  ...sharedPharmacyRoles,
  "warehouse_manager",
  "department_user",
] as const satisfies readonly RoleId[];

export const roleDefaults: RoleDefaults = Object.freeze({
  ...Object.fromEntries(
    dashboardRoles.map((role) => [role, { dashboard: ["read"] }]),
  ),
  ...Object.fromEntries(
    sharedPharmacyRoles.map((role) => [
      role,
      {
        dashboard: ["read"],
        announcements: ["read"],
        zebra_labels: ["read"],
      },
    ]),
  ),
  department_user: {
    dashboard: ["read"],
    new_request: ["read", "create"],
  },
});

export function isScopeWithin(subject: UserScope, target: UserScope): boolean {
  if (subject.platformId !== target.platformId) return false;
  if (subject.kind === "platform") return true;

  if (
    target.kind === "platform" ||
    subject.organizationId !== target.organizationId
  ) {
    return false;
  }

  if (subject.kind === "organization") return true;
  return target.kind === "facility" && subject.facilityId === target.facilityId;
}

function overrideMatches(
  override: PermissionOverride,
  request: Pick<PermissionRequest, "resource" | "action" | "targetScope">,
): boolean {
  return (
    override.resource === request.resource &&
    override.action === request.action &&
    (!override.scope || isScopeWithin(override.scope, request.targetScope))
  );
}

export function resolvePermission(
  request: PermissionRequest,
): PermissionDecision {
  return resolvePermissionForRoles({
    ...request,
    roles: [request.role],
  });
}

interface MultiRolePermissionRequest extends Omit<PermissionRequest, "role"> {
  roles: readonly RoleId[];
}

function resolvePermissionForRoles(
  request: MultiRolePermissionRequest,
): PermissionDecision {
  if (!isScopeWithin(request.subjectScope, request.targetScope)) {
    return { allowed: false, reason: "scope_mismatch" };
  }

  const feature = resourceFeatures[request.resource];
  if (feature && request.featureFlags?.[feature] !== true) {
    return { allowed: false, reason: "feature_disabled" };
  }

  const matchingOverrides = (request.overrides ?? []).filter((override) =>
    overrideMatches(override, request),
  );

  if (matchingOverrides.some((override) => override.effect === "deny")) {
    return { allowed: false, reason: "explicit_deny" };
  }

  if (matchingOverrides.some((override) => override.effect === "allow")) {
    return { allowed: true, reason: "explicit_allow" };
  }

  if (
    request.roles.some((role) =>
      roleDefaults[role]?.[request.resource]?.includes(request.action),
    )
  ) {
    return { allowed: true, reason: "role_default" };
  }

  return { allowed: false, reason: "default_deny" };
}

export function resolveScopedPermission(
  request: ScopedPermissionRequest,
): PermissionDecision {
  const roles = request.roleAssignments
    .filter((assignment) =>
      isScopeWithin(assignment.scope, request.targetScope),
    )
    .map((assignment) => assignment.role);

  return resolvePermissionForRoles({ ...request, roles });
}

export function can(request: PermissionRequest): boolean {
  return resolvePermission(request).allowed;
}

export interface FeatureAccessRequest extends Omit<
  PermissionRequest,
  "resource" | "action"
> {
  feature: FeatureId;
}

export function canAccessFeature(request: FeatureAccessRequest): boolean {
  return can({
    ...request,
    resource: featureResources[request.feature],
    action: "read",
  });
}
