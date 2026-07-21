import { createAuthenticationClientController } from "@/services/auth/client-controller";
import { createIdentitySessionResolutionService } from "@/services/auth/session-service";
import type { AuthenticationClientController } from "@/services/contracts/auth";
import { getFirebaseAuthenticationProvider } from "@/services/firebase/auth-adapter";

const unconfiguredTrustedSessions = createIdentitySessionResolutionService({
  userProfiles: {
    async getByUid() {
      return null;
    },
  },
  roleAssignments: {
    async listByUid() {
      return [];
    },
  },
  tenantDirectories: {
    async getByTenantId() {
      return null;
    },
  },
});

let firebaseAuthenticationController:
  AuthenticationClientController | undefined;

export function getFirebaseAuthenticationController(): AuthenticationClientController {
  firebaseAuthenticationController ??= createAuthenticationClientController(
    getFirebaseAuthenticationProvider(),
    unconfiguredTrustedSessions,
  );
  return firebaseAuthenticationController;
}
