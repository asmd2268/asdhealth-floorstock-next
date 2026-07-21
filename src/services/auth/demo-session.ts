import { resolveSession } from "@/domain/auth/session-resolver";
import type {
  ProviderIdentity,
  RoleAssignmentRecord,
  TenantDirectory,
  UserProfileRecord,
} from "@/domain/auth/types";
import {
  demoFacility,
  demoOrganization,
  demoPlatform,
} from "@/config/platform";
import type { SessionResolutionService } from "@/services/contracts/auth";

const demoIdentity: ProviderIdentity = {
  uid: "demo-pharmacy-manager",
  email: "demo@asdhealth.local",
  displayName: "ASDHealth Demo",
};

const demoProfile: UserProfileRecord = {
  uid: demoIdentity.uid,
  tenantId: "demo-tenant",
  organizationId: demoOrganization.id,
  facilityIds: [demoFacility.id],
  activeFacilityId: demoFacility.id,
  accountStatus: "active",
  explicitPermissionOverrides: [],
};

const demoAssignments: readonly RoleAssignmentRecord[] = [
  {
    uid: demoIdentity.uid,
    tenantId: "demo-tenant",
    roleId: "pharmacy_manager",
    scope: {
      kind: "facility",
      platformId: demoPlatform.id,
      organizationId: demoOrganization.id,
      facilityId: demoFacility.id,
    },
  },
];

const demoTenantDirectory: TenantDirectory = {
  tenantId: "demo-tenant",
  platformId: demoPlatform.id,
  organizations: [{ id: demoOrganization.id }],
  facilities: [{ id: demoFacility.id, organizationId: demoOrganization.id }],
};

export const explicitDemoSessionService: SessionResolutionService = {
  async resolve() {
    return resolveSession({
      identity: demoIdentity,
      profile: demoProfile,
      roleAssignments: demoAssignments,
      tenantDirectory: demoTenantDirectory,
    });
  },
};
