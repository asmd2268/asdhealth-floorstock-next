import "server-only";

import { resolveScopedPermission } from "@/domain/access/permissions";
import type { AuthenticatedUser } from "@/domain/auth/types";
import type { FeatureFlagSet, UserScope } from "@/domain/platform/types";
import type { TenantDirectoryRepository } from "@/services/contracts/auth";
import type { FacilityDisplayOption } from "@/services/contracts/server-session";

import { getServerTrustedRepositoryAdapters } from "./trusted-repositories";

export async function resolveFacilityDisplayOptions(
  user: AuthenticatedUser,
  featureFlags: FeatureFlagSet,
  tenantDirectories: TenantDirectoryRepository,
): Promise<readonly FacilityDisplayOption[] | null> {
  let directory;
  try {
    directory = await tenantDirectories.getByTenantId(user.tenantId);
  } catch {
    return null;
  }
  if (
    !directory ||
    directory.status !== "active" ||
    directory.tenantId !== user.tenantId ||
    directory.platformId !== user.platformId
  ) {
    return null;
  }

  const organizationIds = new Set(
    directory.organizations.map((organization) => organization.id),
  );
  const options: FacilityDisplayOption[] = [];
  for (const facilityId of user.facilityIds) {
    const facility = directory.facilities.find(
      (candidate) => candidate.id === facilityId,
    );
    if (
      !facility ||
      !organizationIds.has(facility.organizationId) ||
      (user.organizationId !== null &&
        facility.organizationId !== user.organizationId)
    ) {
      return null;
    }
    const facilityScope: UserScope = {
      kind: "facility",
      platformId: directory.platformId,
      organizationId: facility.organizationId,
      facilityId: facility.id,
    };
    if (
      !resolveScopedPermission({
        roleAssignments: user.roleAssignments,
        resource: "dashboard",
        action: "read",
        subjectScope: facilityScope,
        targetScope: facilityScope,
        featureFlags,
        overrides: user.explicitPermissionOverrides,
      }).allowed
    ) {
      continue;
    }
    options.push({
      id: facility.id,
      displayName: facility.displayName ?? facility.id,
    });
  }

  return options.some((option) => option.id === user.activeFacilityId)
    ? options
    : null;
}

export function getServerFacilityDisplayOptions(
  user: AuthenticatedUser,
  featureFlags: FeatureFlagSet,
): Promise<readonly FacilityDisplayOption[] | null> {
  return resolveFacilityDisplayOptions(
    user,
    featureFlags,
    getServerTrustedRepositoryAdapters().tenantDirectories,
  );
}
