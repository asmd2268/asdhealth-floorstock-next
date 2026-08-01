import {
  isPermissionAction,
  isResourceId,
  isRoleId,
  type PermissionEffect,
} from "@/domain/access/types";
import {
  featureIds,
  type FeatureFlagSet,
  type UserScope,
} from "@/domain/platform/types";

import {
  accountStatuses,
  type AssignmentScopeRecord,
  type ProviderIdentity,
  type RoleAssignmentRecord,
  type SessionFailure,
  type SessionFailureReason,
  type SessionResolutionResult,
  type TenantDirectory,
  type UserProfileRecord,
  type ValidatedPermissionOverrideRecord,
  type ValidatedRoleAssignmentRecord,
} from "./types";

export interface SessionResolverInput {
  identity: ProviderIdentity | null;
  profile: UserProfileRecord | null;
  roleAssignments: readonly RoleAssignmentRecord[];
  tenantDirectory: TenantDirectory | null;
  requestedActiveFacilityId?: string;
}

function denied(reason: SessionFailureReason): SessionResolutionResult {
  return {
    ok: false,
    failure: { category: "access_denied", reason },
  };
}

export function providerFailure(): SessionFailure {
  return { category: "provider_error", reason: "provider_unavailable" };
}

function resolveFeatureFlags(
  flags: TenantDirectory["featureFlags"],
): FeatureFlagSet | null {
  if (!flags) return null;
  const existingFeatures = featureIds.filter(
    (feature) => feature !== "inventory",
  );
  if (
    existingFeatures.some((feature) => typeof flags[feature] !== "boolean") ||
    (flags.inventory !== undefined && typeof flags.inventory !== "boolean")
  ) {
    return null;
  }

  return Object.fromEntries(
    featureIds.map((feature) => [
      feature,
      feature === "inventory" ? flags.inventory === true : flags[feature],
    ]),
  ) as FeatureFlagSet;
}

function hasKnownAccountStatus(
  value: UserProfileRecord["accountStatus"],
): value is NonNullable<UserProfileRecord["accountStatus"]> {
  return (
    typeof value === "string" &&
    (accountStatuses as readonly string[]).includes(value)
  );
}

function resolveScope(
  scope: AssignmentScopeRecord,
  directory: TenantDirectory,
  facilityIds: ReadonlySet<string>,
  organizationId: string | null,
): UserScope | null {
  if (scope.platformId !== directory.platformId) return null;

  if (scope.kind === "platform") {
    return { kind: "platform", platformId: directory.platformId };
  }

  const organizationExists = directory.organizations.some(
    (organization) => organization.id === scope.organizationId,
  );
  if (!organizationExists) return null;
  if (organizationId && organizationId !== scope.organizationId) return null;

  if (scope.kind === "organization") {
    const hasFacilityInOrganization = directory.facilities.some(
      (facility) =>
        facility.organizationId === scope.organizationId &&
        facilityIds.has(facility.id),
    );
    return hasFacilityInOrganization ? scope : null;
  }

  const facility = directory.facilities.find(
    (candidate) => candidate.id === scope.facilityId,
  );
  if (
    !facility ||
    facility.organizationId !== scope.organizationId ||
    !facilityIds.has(scope.facilityId)
  ) {
    return null;
  }

  return scope;
}

function validateRoleAssignments(
  records: readonly RoleAssignmentRecord[],
  identity: ProviderIdentity,
  profile: UserProfileRecord & { tenantId: string },
  directory: TenantDirectory,
  facilityIds: ReadonlySet<string>,
  organizationId: string | null,
):
  | { ok: true; assignments: readonly ValidatedRoleAssignmentRecord[] }
  | { ok: false; reason: SessionFailureReason } {
  if (records.length === 0) {
    return { ok: false, reason: "role_assignment_missing" };
  }

  const assignments: ValidatedRoleAssignmentRecord[] = [];
  for (const record of records) {
    if (record.uid !== identity.uid || record.tenantId !== profile.tenantId) {
      return { ok: false, reason: "role_assignment_mismatch" };
    }
    if (!isRoleId(record.roleId)) {
      return { ok: false, reason: "unknown_role" };
    }

    const scope = resolveScope(
      record.scope,
      directory,
      facilityIds,
      organizationId,
    );
    if (!scope) return { ok: false, reason: "role_scope_invalid" };
    assignments.push({ role: record.roleId, scope });
  }

  return { ok: true, assignments };
}

function validateOverrides(
  records: NonNullable<UserProfileRecord["explicitPermissionOverrides"]>,
  directory: TenantDirectory,
  facilityIds: ReadonlySet<string>,
  organizationId: string | null,
): readonly ValidatedPermissionOverrideRecord[] | null {
  const overrides: ValidatedPermissionOverrideRecord[] = [];

  for (const record of records) {
    if (
      (record.effect !== "allow" && record.effect !== "deny") ||
      !isResourceId(record.resource) ||
      !isPermissionAction(record.action)
    ) {
      return null;
    }

    const scope = resolveScope(
      record.scope,
      directory,
      facilityIds,
      organizationId,
    );
    if (!scope) return null;

    overrides.push({
      effect: record.effect as PermissionEffect,
      resource: record.resource,
      action: record.action,
      scope,
    });
  }

  return overrides;
}

export function resolveSession(
  input: SessionResolverInput,
): SessionResolutionResult {
  const {
    identity,
    profile,
    requestedActiveFacilityId,
    roleAssignments,
    tenantDirectory,
  } = input;
  if (!identity) return denied("unauthenticated");
  if (!profile) return denied("profile_not_found");
  if (profile.uid !== identity.uid) return denied("identity_mismatch");

  if (
    !profile.tenantId ||
    !Array.isArray(profile.facilityIds) ||
    profile.facilityIds.length === 0 ||
    !hasKnownAccountStatus(profile.accountStatus)
  ) {
    return denied("profile_incomplete");
  }

  if (profile.accountStatus === "disabled") return denied("account_disabled");
  if (profile.accountStatus !== "active") return denied("account_inactive");
  if (!tenantDirectory) return denied("tenant_not_found");
  if (profile.tenantId !== tenantDirectory.tenantId) {
    return denied("tenant_mismatch");
  }
  if (tenantDirectory.status !== "active") return denied("tenant_inactive");

  const directoryOrganizationIds = tenantDirectory.organizations.map(
    (organization) => organization.id,
  );
  if (
    new Set(directoryOrganizationIds).size !== directoryOrganizationIds.length
  ) {
    return denied("organization_mismatch");
  }
  const directoryFacilityIds = tenantDirectory.facilities.map(
    (facility) => facility.id,
  );
  if (new Set(directoryFacilityIds).size !== directoryFacilityIds.length) {
    return denied("facility_mismatch");
  }
  const departments = tenantDirectory.departments ?? [];
  const directoryDepartmentIds = departments.map((department) => department.id);
  if (new Set(directoryDepartmentIds).size !== directoryDepartmentIds.length) {
    return denied("department_mismatch");
  }
  for (const department of departments) {
    const facility = tenantDirectory.facilities.find(
      (candidate) => candidate.id === department.facilityId,
    );
    if (!facility || facility.organizationId !== department.organizationId)
      return denied("department_mismatch");
  }

  const featureFlags = resolveFeatureFlags(tenantDirectory.featureFlags);
  if (!featureFlags) return denied("feature_flags_missing");

  const organizationId = profile.organizationId ?? null;
  if (
    organizationId &&
    !tenantDirectory.organizations.some(
      (organization) => organization.id === organizationId,
    )
  ) {
    return denied("organization_mismatch");
  }

  if (new Set(profile.facilityIds).size !== profile.facilityIds.length) {
    return denied("facility_mismatch");
  }
  const uniqueFacilityIds = [...profile.facilityIds].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const facilityId of uniqueFacilityIds) {
    const facility = tenantDirectory.facilities.find(
      (candidate) => candidate.id === facilityId,
    );
    if (!facility) return denied("facility_mismatch");
    if (
      !tenantDirectory.organizations.some(
        (organization) => organization.id === facility.organizationId,
      )
    ) {
      return denied("facility_mismatch");
    }
    if (organizationId && facility.organizationId !== organizationId) {
      return denied("facility_mismatch");
    }
  }

  if (
    profile.activeFacilityId !== null &&
    profile.activeFacilityId !== undefined &&
    !uniqueFacilityIds.includes(profile.activeFacilityId)
  ) {
    return denied("active_facility_invalid");
  }
  const activeFacilityId =
    requestedActiveFacilityId ??
    profile.activeFacilityId ??
    uniqueFacilityIds.at(0) ??
    null;
  if (!activeFacilityId || !uniqueFacilityIds.includes(activeFacilityId)) {
    return denied("active_facility_invalid");
  }

  const activeFacility = tenantDirectory.facilities.find(
    (facility) => facility.id === activeFacilityId,
  );
  if (!activeFacility) return denied("active_facility_invalid");

  const profileDepartmentIds = profile.departmentIds ?? [];
  if (new Set(profileDepartmentIds).size !== profileDepartmentIds.length)
    return denied("department_mismatch");
  const uniqueDepartmentIds = [...profileDepartmentIds].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const departmentId of uniqueDepartmentIds) {
    const department = departments.find(
      (candidate) => candidate.id === departmentId,
    );
    if (
      !department ||
      !uniqueFacilityIds.includes(department.facilityId) ||
      (organizationId && department.organizationId !== organizationId)
    )
      return denied("department_mismatch");
  }
  const preferredDepartmentId = profile.activeDepartmentId ?? null;
  if (
    preferredDepartmentId !== null &&
    !uniqueDepartmentIds.includes(preferredDepartmentId)
  )
    return denied("active_department_invalid");
  const preferredDepartment = preferredDepartmentId
    ? departments.find((department) => department.id === preferredDepartmentId)
    : null;
  if (preferredDepartmentId && !preferredDepartment)
    return denied("active_department_invalid");
  if (
    preferredDepartment &&
    requestedActiveFacilityId === undefined &&
    preferredDepartment.facilityId !== activeFacilityId
  )
    return denied("active_department_invalid");
  const activeDepartmentId =
    preferredDepartment && preferredDepartment.facilityId === activeFacilityId
      ? preferredDepartment.id
      : (uniqueDepartmentIds.find(
          (departmentId) =>
            departments.find((department) => department.id === departmentId)
              ?.facilityId === activeFacilityId,
        ) ?? null);

  const facilitySet = new Set(uniqueFacilityIds);
  const validatedAssignments = validateRoleAssignments(
    roleAssignments,
    identity,
    profile as UserProfileRecord & { tenantId: string },
    tenantDirectory,
    facilitySet,
    organizationId,
  );
  if (!validatedAssignments.ok) return denied(validatedAssignments.reason);
  const hasActiveDepartmentRole = validatedAssignments.assignments.some(
    (assignment) =>
      assignment.role === "department_user" &&
      (assignment.scope.kind === "platform" ||
        assignment.scope.kind === "organization" ||
        (assignment.scope.kind === "facility" &&
          assignment.scope.facilityId === activeFacilityId)),
  );
  if (hasActiveDepartmentRole && activeDepartmentId === null)
    return denied("active_department_invalid");

  const validatedOverrides = validateOverrides(
    profile.explicitPermissionOverrides ?? [],
    tenantDirectory,
    facilitySet,
    organizationId,
  );
  if (!validatedOverrides) return denied("permission_override_invalid");

  const activeScope: UserScope = {
    kind: "facility",
    platformId: tenantDirectory.platformId,
    organizationId: activeFacility.organizationId,
    facilityId: activeFacility.id,
  };

  return {
    ok: true,
    featureFlags,
    user: {
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      tenantId: profile.tenantId,
      platformId: tenantDirectory.platformId,
      organizationId,
      facilityIds: uniqueFacilityIds,
      activeFacilityId,
      departmentIds: uniqueDepartmentIds,
      activeDepartmentId,
      activeScope,
      roleAssignments: validatedAssignments.assignments,
      explicitPermissionOverrides: validatedOverrides,
      accountStatus: "active",
    },
  };
}
