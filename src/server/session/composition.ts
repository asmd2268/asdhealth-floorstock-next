import "server-only";

import { createIdentitySessionResolutionService } from "@/services/auth/session-service";

import { getFirebaseServerIdentityVerifier } from "./firebase-identity";
import { getFirestoreServerSessionStore } from "./firestore-store";
import { createServerSessionService } from "./service";
import { getServerTrustedRepositoryAdapters } from "./trusted-repositories";
import type { ServerSessionService } from "./types";

let serverSessionService: ServerSessionService | undefined;

export function getServerSessionService(): ServerSessionService {
  serverSessionService ??= createServerSessionService({
    identityVerifier: getFirebaseServerIdentityVerifier(),
    trustedSessions: createIdentitySessionResolutionService(
      getServerTrustedRepositoryAdapters(),
    ),
    store: getFirestoreServerSessionStore(),
  });
  return serverSessionService;
}
