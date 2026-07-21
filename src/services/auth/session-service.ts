import {
  providerFailure,
  resolveSession,
} from "@/domain/auth/session-resolver";
import type { SessionResolutionResult } from "@/domain/auth/types";
import type {
  AuthenticationProvider,
  RoleAssignmentRepository,
  SessionResolutionService,
  TenantDirectoryRepository,
  UserProfileRepository,
} from "@/services/contracts/auth";

export interface SessionServiceDependencies {
  authenticationProvider: AuthenticationProvider;
  userProfiles: UserProfileRepository;
  roleAssignments: RoleAssignmentRepository;
  tenantDirectories: TenantDirectoryRepository;
}

export function createSessionResolutionService(
  dependencies: SessionServiceDependencies,
): SessionResolutionService {
  return {
    async resolve(): Promise<SessionResolutionResult> {
      try {
        const identity =
          await dependencies.authenticationProvider.getIdentity();
        if (!identity) {
          return resolveSession({
            identity: null,
            profile: null,
            roleAssignments: [],
            tenantDirectory: null,
          });
        }

        const profile = await dependencies.userProfiles.getByUid(identity.uid);
        if (!profile) {
          return resolveSession({
            identity,
            profile: null,
            roleAssignments: [],
            tenantDirectory: null,
          });
        }

        const [assignments, tenantDirectory] = await Promise.all([
          dependencies.roleAssignments.listByUid(identity.uid),
          profile.tenantId
            ? dependencies.tenantDirectories.getByTenantId(profile.tenantId)
            : Promise.resolve(null),
        ]);

        return resolveSession({
          identity,
          profile,
          roleAssignments: assignments,
          tenantDirectory,
        });
      } catch {
        return { ok: false, failure: providerFailure() };
      }
    },
  };
}
