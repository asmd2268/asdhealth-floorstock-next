import { createServerSessionAuthenticationController } from "@/services/auth/server-session-controller";
import { getBrowserServerSessionTransport } from "@/services/auth/server-session-transport";
import type {
  AuthenticationClientController,
  AuthenticationProvider,
} from "@/services/contracts/auth";
import type {
  BrowserServerSessionTransport,
  IdentityTokenProvider,
} from "@/services/contracts/server-session";
import { getFirebaseAuthenticationProvider } from "@/services/firebase/auth-adapter";

export function createProductionFirebaseAuthenticationController(
  authenticationProvider: AuthenticationProvider & IdentityTokenProvider,
  sessionTransport: BrowserServerSessionTransport,
  sessionEstablished: () => void,
): AuthenticationClientController {
  return createServerSessionAuthenticationController(
    authenticationProvider,
    sessionTransport,
    sessionEstablished,
  );
}

let firebaseAuthenticationController:
  AuthenticationClientController | undefined;

export function getFirebaseAuthenticationController(): AuthenticationClientController {
  firebaseAuthenticationController ??=
    createProductionFirebaseAuthenticationController(
      getFirebaseAuthenticationProvider(),
      getBrowserServerSessionTransport(),
      () => window.location.assign("/app"),
    );
  return firebaseAuthenticationController;
}
