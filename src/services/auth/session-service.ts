import {
  providerFailure,
  resolveSession,
} from "@/domain/auth/session-resolver";
import type { SessionResolutionResult } from "@/domain/auth/types";
import type {
  AuthenticationProvider,
  IdentitySessionResolutionService,
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

type TrustedSessionDependencies = Omit<
  SessionServiceDependencies,
  "authenticationProvider"
>;

export function createIdentitySessionResolutionService(
  dependencies: TrustedSessionDependencies,
): IdentitySessionResolutionService {
  return {
    async resolveIdentity(identity): Promise<SessionResolutionResult> {
      try {
        const profile = await dependencies.userProfiles.getByUid(identity.uid);
        if (!profile) {
          return resolveSession({
            identity,
            profile: null,
            roleAssignments: [],
            tenantDirectory: null,
          });
        }

        if (!profile.tenantId) {
          return resolveSession({
            identity,
            profile,
            roleAssignments: [],
            tenantDirectory: null,
          });
        }

        const [assignments, tenantDirectory] = await Promise.all([
          dependencies.roleAssignments.listByUid(
            identity.uid,
            profile.tenantId,
          ),
          dependencies.tenantDirectories.getByTenantId(profile.tenantId),
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

export function createSessionResolutionService(
  dependencies: SessionServiceDependencies,
): SessionResolutionService {
  const identitySessions = createIdentitySessionResolutionService(dependencies);

  return {
    async resolve(): Promise<SessionResolutionResult> {
      try {
        const identityResult =
          await dependencies.authenticationProvider.getIdentity();
        if (!identityResult.ok) {
          return { ok: false, failure: providerFailure() };
        }
        const identity = identityResult.identity;
        if (!identity) {
          return resolveSession({
            identity: null,
            profile: null,
            roleAssignments: [],
            tenantDirectory: null,
          });
        }

        return identitySessions.resolveIdentity(identity);
      } catch {
        return { ok: false, failure: providerFailure() };
      }
    },
  };
}
