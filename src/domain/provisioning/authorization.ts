import type { AdministrativeAction, AdministratorPrincipal } from "./types";
import type { TenantDirectory } from "@/domain/auth/types";

export const allowedAdministrativeActions = {
  platform_owner: [
    "create_tenant",
    "upsert_facility",
    "upsert_user_profile",
    "set_account_status",
    "assign_role",
    "revoke_role_assignment",
    "replace_feature_flags",
  ],
  tenant_admin_unrestricted: [
    "upsert_facility",
    "upsert_user_profile",
    "set_account_status",
    "assign_role",
    "revoke_role_assignment",
    "replace_feature_flags",
  ],
  tenant_admin_restricted: [
    "upsert_facility",
    "upsert_user_profile",
    "set_account_status",
    "assign_role",
    "revoke_role_assignment",
  ],
} as const satisfies Record<
  "platform_owner" | "tenant_admin_unrestricted" | "tenant_admin_restricted",
  readonly AdministrativeAction[]
>;

export function canAdministratorPerform(
  actor: AdministratorPrincipal,
  action: AdministrativeAction,
  target: { tenantId: string; platformId: string },
): boolean {
  if (actor.platformId !== target.platformId) return false;
  const policy =
    actor.kind === "platform_owner"
      ? allowedAdministrativeActions.platform_owner
      : actor.scope === "unrestricted"
        ? allowedAdministrativeActions.tenant_admin_unrestricted
        : allowedAdministrativeActions.tenant_admin_restricted;
  if (!(policy as readonly AdministrativeAction[]).includes(action)) {
    return false;
  }
  if (actor.kind === "platform_owner") return true;
  return actor.tenantId === target.tenantId;
}

export function isTenantAdministratorAuthorizedForDirectory(
  actor: Extract<AdministratorPrincipal, { kind: "tenant_admin" }>,
  directory: TenantDirectory,
): boolean {
  if (
    directory.status !== "active" ||
    directory.tenantId !== actor.tenantId ||
    directory.platformId !== actor.platformId
  ) {
    return false;
  }
  if (actor.scope === "unrestricted") return true;

  const organizationIds = new Set(
    directory.organizations.map((organization) => organization.id),
  );
  if (
    actor.organizationIds.some(
      (organizationId) => !organizationIds.has(organizationId),
    )
  ) {
    return false;
  }

  return actor.facilityIds.every((facilityId) => {
    const facility = directory.facilities.find(
      (candidate) => candidate.id === facilityId,
    );
    return (
      facility !== undefined &&
      actor.organizationIds.includes(facility.organizationId)
    );
  });
}
