import type { AccountStatus, AssignmentScopeRecord } from "@/domain/auth/types";
import type { FeatureFlagSet } from "@/domain/platform/types";
import type { RoleId } from "@/domain/access/types";
import type {
  AdministratorPrincipal,
  AdministrativeAction,
  ProvisioningAuditEvent,
} from "@/domain/provisioning/types";

export const ADMINISTRATION_PAGE_SIZE = 25;
export const ADMINISTRATION_READ_LIMIT = 51;
export const ADMINISTRATION_TOTAL_READ_LIMIT = 103;

export type AdministrationFailureCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "provider_unavailable";

export type AdministrationResult<T> =
  { ok: true; value: T } | { ok: false; code: AdministrationFailureCode };

export interface AdministrationContext {
  principal: AdministratorPrincipal;
  tenantId: string;
  platformId: string;
  sessionUid: string;
}

export interface AdministrationUserSummary {
  uid: string;
  organizationId: string | null;
  facilityIds: readonly string[];
  activeFacilityId: string | null;
  departmentIds: readonly string[];
  activeDepartmentId: string | null;
  accountStatus: AccountStatus;
}

export interface AdministrationRoleAssignment {
  assignmentId: string;
  roleId: RoleId;
  scope: AssignmentScopeRecord;
}

export interface AdministrationUserDetail extends AdministrationUserSummary {
  roleAssignments: readonly AdministrationRoleAssignment[];
}

export interface AdministrationPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface AdministrationDirectory {
  tenantId: string;
  organizations: readonly { id: string }[];
  facilities: readonly {
    id: string;
    organizationId: string;
    displayName?: string;
  }[];
  departments: readonly {
    id: string;
    organizationId: string;
    facilityId: string;
    displayName?: string;
  }[];
}

export interface AdministrationFeatureFlags {
  tenantId: string;
  featureFlags: FeatureFlagSet;
}

export interface AdministrationAuditEntry {
  eventId: string;
  actorUid: string;
  action: AdministrativeAction;
  targetType: ProvisioningAuditEvent["targetType"];
  targetId: string;
  timestamp: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}
