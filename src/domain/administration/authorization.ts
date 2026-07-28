import type { UserProfileRecord, TenantDirectory } from "@/domain/auth/types";
import type {
  AdministratorPrincipal,
  AdministrativeAction,
} from "@/domain/provisioning/types";
import { canAdministratorPerform } from "@/domain/provisioning/authorization";

export function canReadAdministration(
  principal: AdministratorPrincipal,
  tenantId: string,
  platformId: string,
): boolean {
  return (
    principal.platformId === platformId &&
    (principal.kind === "platform_owner" || principal.tenantId === tenantId)
  );
}

export function canReadFeatures(
  principal: AdministratorPrincipal,
  tenantId: string,
  platformId: string,
): boolean {
  return canAdministratorPerform(principal, "replace_feature_flags", {
    tenantId,
    platformId,
  });
}

export function canMutateAdministration(
  principal: AdministratorPrincipal,
  action: AdministrativeAction,
  tenantId: string,
  platformId: string,
): boolean {
  return canAdministratorPerform(principal, action, { tenantId, platformId });
}

export function isProfileVisible(
  principal: AdministratorPrincipal,
  profile: Pick<
    UserProfileRecord,
    "tenantId" | "organizationId" | "facilityIds"
  >,
): boolean {
  if (principal.kind === "platform_owner") return true;
  if (profile.tenantId !== principal.tenantId) return false;
  if (principal.scope === "unrestricted") return true;
  return Boolean(
    profile.organizationId &&
    principal.organizationIds.includes(profile.organizationId) &&
    profile.facilityIds?.every((id) => principal.facilityIds.includes(id)),
  );
}

export function filterDirectory(
  principal: AdministratorPrincipal,
  directory: TenantDirectory,
): AdministrationDirectoryView {
  if (principal.kind !== "tenant_admin" || principal.scope === "unrestricted") {
    return {
      organizations: directory.organizations,
      facilities: directory.facilities,
    };
  }
  return {
    organizations: directory.organizations.filter((item) =>
      principal.organizationIds.includes(item.id),
    ),
    facilities: directory.facilities.filter(
      (item) =>
        principal.organizationIds.includes(item.organizationId) &&
        principal.facilityIds.includes(item.id),
    ),
  };
}

export interface AdministrationDirectoryView {
  organizations: TenantDirectory["organizations"];
  facilities: TenantDirectory["facilities"];
}
