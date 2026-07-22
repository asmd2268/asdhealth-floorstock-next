import type { AdministrativeAction, AdministratorPrincipal } from "./types";

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
  tenant_admin: [
    "upsert_facility",
    "upsert_user_profile",
    "set_account_status",
    "assign_role",
    "revoke_role_assignment",
    "replace_feature_flags",
  ],
} as const satisfies Record<
  AdministratorPrincipal["kind"],
  readonly AdministrativeAction[]
>;

export function canAdministratorPerform(
  actor: AdministratorPrincipal,
  action: AdministrativeAction,
  target: { tenantId: string; platformId: string },
): boolean {
  if (actor.platformId !== target.platformId) return false;
  if (
    !(
      allowedAdministrativeActions[
        actor.kind
      ] as readonly AdministrativeAction[]
    ).includes(action)
  ) {
    return false;
  }
  return actor.kind === "platform_owner" || actor.tenantId === target.tenantId;
}
