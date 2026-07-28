import type { RoleId } from "@/domain/access/types";
import type {
  AssignmentScopeRecord,
  PermissionOverrideRecord,
} from "@/domain/auth/types";
import type { FeatureFlagSet } from "@/domain/platform/types";

export const administrativeActions = [
  "create_tenant",
  "upsert_facility",
  "upsert_user_profile",
  "set_account_status",
  "assign_role",
  "revoke_role_assignment",
  "replace_feature_flags",
] as const;

export type AdministrativeAction = (typeof administrativeActions)[number];

export type AdministratorPrincipal =
  | {
      kind: "platform_owner";
      uid: string;
      platformId: string;
    }
  | {
      kind: "tenant_admin";
      scope: "unrestricted";
      uid: string;
      platformId: string;
      tenantId: string;
    }
  | {
      kind: "tenant_admin";
      scope: "restricted";
      uid: string;
      platformId: string;
      tenantId: string;
      organizationIds: readonly string[];
      facilityIds: readonly string[];
    };

export interface ProvisioningRequestContext {
  actor: AdministratorPrincipal;
  requestId: string;
}

export interface CreateTenantInput {
  tenantId: string;
  platformId: string;
  organizations: readonly { id: string }[];
  facilities: readonly {
    id: string;
    organizationId: string;
    displayName?: string;
  }[];
  featureFlags: FeatureFlagSet;
}

export interface UpsertFacilityInput {
  tenantId: string;
  facility: { id: string; organizationId: string; displayName?: string };
}

export interface UpsertUserProfileInput {
  uid: string;
  tenantId: string;
  organizationId: string | null;
  facilityIds: readonly string[];
  activeFacilityId: string | null;
  accountStatus: "active" | "disabled" | "pending" | "suspended";
  explicitPermissionOverrides: readonly PermissionOverrideRecord[];
}

export interface SetAccountStatusInput {
  uid: string;
  tenantId: string;
  accountStatus: "active" | "disabled";
}

export interface AssignRoleInput {
  assignmentId: string;
  uid: string;
  tenantId: string;
  roleId: RoleId;
  scope: AssignmentScopeRecord;
}

export interface RevokeRoleAssignmentInput {
  assignmentId: string;
  uid: string;
  tenantId: string;
}

export interface ReplaceFeatureFlagsInput {
  tenantId: string;
  featureFlags: FeatureFlagSet;
}

export type ProvisioningFailureCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "provider_unavailable";

export type ProvisioningResult =
  { ok: true } | { ok: false; code: ProvisioningFailureCode };

export interface ProvisioningAuditEvent {
  eventId: string;
  actor: AdministratorPrincipal;
  action: AdministrativeAction;
  targetType:
    | "tenant"
    | "facility"
    | "user_profile"
    | "account"
    | "role_assignment"
    | "feature_flags";
  targetId: string;
  tenantId: string;
  timestamp: string;
  requestId: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}
