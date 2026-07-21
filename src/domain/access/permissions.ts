import type { FeatureId, UserScope } from "@/domain/platform/types";

import type {
  PermissionAction,
  PermissionDecision,
  PermissionOverride,
  PermissionRequest,
  ResourceId,
  RoleId,
} from "./types";

type RoleDefaults = Readonly<
  Partial<
    Record<
      RoleId,
      Readonly<Partial<Record<ResourceId, readonly PermissionAction[]>>>
    >
  >
>;

const featureResources: Readonly<Record<FeatureId, ResourceId>> = {
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

export const roleDefaults: RoleDefaults = Object.freeze({
  ...Object.fromEntries(
    sharedPharmacyRoles.map((role) => [
      role,
      {
        announcements: ["read"],
        zebra_labels: ["read"],
      },
    ]),
  ),
  department_user: {
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
  request: PermissionRequest,
): boolean {
  return (
    override.resource === request.resource &&
    override.action === request.action &&
    (!override.feature || override.feature === request.feature) &&
    (!override.scope || isScopeWithin(override.scope, request.targetScope))
  );
}

export function resolvePermission(
  request: PermissionRequest,
): PermissionDecision {
  if (!isScopeWithin(request.subjectScope, request.targetScope)) {
    return { allowed: false, reason: "scope_mismatch" };
  }

  if (request.feature && request.featureFlags?.[request.feature] !== true) {
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

  const actions = roleDefaults[request.role]?.[request.resource];
  if (actions?.includes(request.action)) {
    return { allowed: true, reason: "role_default" };
  }

  return { allowed: false, reason: "default_deny" };
}

export function can(request: PermissionRequest): boolean {
  return resolvePermission(request).allowed;
}

export interface FeatureAccessRequest extends Omit<
  PermissionRequest,
  "resource" | "action" | "feature"
> {
  feature: FeatureId;
}

export function canAccessFeature(request: FeatureAccessRequest): boolean {
  return can({
    ...request,
    resource: featureResources[request.feature],
    action: "read",
    feature: request.feature,
  });
}
