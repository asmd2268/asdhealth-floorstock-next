import type {
  PermissionAction,
  PermissionEffect,
  PermissionOverride,
  ResourceId,
  RoleId,
  ScopedRoleAssignment,
} from "@/domain/access/types";
import type { UserScope } from "@/domain/platform/types";

export const accountStatuses = [
  "active",
  "disabled",
  "pending",
  "suspended",
] as const;

export type AccountStatus = (typeof accountStatuses)[number];

export interface ProviderIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface UserProfileRecord {
  uid: string;
  tenantId?: string;
  organizationId?: string | null;
  facilityIds?: readonly string[];
  activeFacilityId?: string | null;
  accountStatus?: AccountStatus;
  explicitPermissionOverrides?: readonly PermissionOverrideRecord[];
}

export type AssignmentScopeRecord =
  | { kind: "platform"; platformId: string }
  | { kind: "organization"; platformId: string; organizationId: string }
  | {
      kind: "facility";
      platformId: string;
      organizationId: string;
      facilityId: string;
    };

export interface RoleAssignmentRecord {
  uid: string;
  tenantId: string;
  roleId: string;
  scope: AssignmentScopeRecord;
}

export interface PermissionOverrideRecord {
  effect: string;
  resource: string;
  action: string;
  scope: AssignmentScopeRecord;
}

export interface TenantOrganizationRecord {
  id: string;
}

export interface TenantFacilityRecord {
  id: string;
  organizationId: string;
}

export interface TenantDirectory {
  tenantId: string;
  platformId: string;
  organizations: readonly TenantOrganizationRecord[];
  facilities: readonly TenantFacilityRecord[];
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  tenantId: string;
  platformId: string;
  organizationId: string | null;
  facilityIds: readonly string[];
  activeFacilityId: string;
  activeScope: UserScope;
  roleAssignments: readonly ScopedRoleAssignment[];
  explicitPermissionOverrides: readonly PermissionOverride[];
  accountStatus: "active";
}

export type SessionFailureReason =
  | "unauthenticated"
  | "profile_not_found"
  | "profile_incomplete"
  | "identity_mismatch"
  | "account_disabled"
  | "account_inactive"
  | "tenant_not_found"
  | "tenant_mismatch"
  | "organization_mismatch"
  | "facility_mismatch"
  | "active_facility_invalid"
  | "role_assignment_missing"
  | "role_assignment_mismatch"
  | "unknown_role"
  | "role_scope_invalid"
  | "permission_override_invalid"
  | "provider_unavailable";

export interface SessionFailure {
  category: "access_denied" | "provider_error";
  reason: SessionFailureReason;
}

export type SessionResolutionResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; failure: SessionFailure };

export type AuthenticationState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "error"; failure: SessionFailure };

export interface ValidatedPermissionOverrideRecord {
  effect: PermissionEffect;
  resource: ResourceId;
  action: PermissionAction;
  scope: UserScope;
}

export interface ValidatedRoleAssignmentRecord {
  role: RoleId;
  scope: UserScope;
}
