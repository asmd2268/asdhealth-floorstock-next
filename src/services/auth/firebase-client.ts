import { createAuthenticationClientController } from "@/services/auth/client-controller";
import { createIdentitySessionResolutionService } from "@/services/auth/session-service";
import type {
  AuthenticationClientController,
  AuthenticationProvider,
} from "@/services/contracts/auth";
import { getFirebaseAuthenticationProvider } from "@/services/firebase/auth-adapter";
import {
  getTrustedSessionRepositoryAdapters,
  type TrustedSessionRepositoryAdapters,
} from "@/services/firebase/trusted-session-repositories";

export function createProductionFirebaseAuthenticationController(
  authenticationProvider: AuthenticationProvider,
  trustedRepositories: TrustedSessionRepositoryAdapters,
): AuthenticationClientController {
  return createAuthenticationClientController(
    authenticationProvider,
    createIdentitySessionResolutionService(trustedRepositories),
  );
}

let firebaseAuthenticationController:
  AuthenticationClientController | undefined;

export function getFirebaseAuthenticationController(): AuthenticationClientController {
  firebaseAuthenticationController ??=
    createProductionFirebaseAuthenticationController(
      getFirebaseAuthenticationProvider(),
      getTrustedSessionRepositoryAdapters(),
    );
  return firebaseAuthenticationController;
}
