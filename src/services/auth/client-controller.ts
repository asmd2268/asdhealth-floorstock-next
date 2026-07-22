import { failClosedFeatureFlags } from "@/config/platform";
import type { SessionFailure } from "@/domain/auth/types";
import type {
  AuthenticationClientController,
  AuthenticationProvider,
  AuthenticationSnapshot,
  IdentitySessionResolutionService,
} from "@/services/contracts/auth";

const loadingSnapshot: AuthenticationSnapshot = {
  authenticationState: { status: "loading" },
  featureFlags: failClosedFeatureFlags,
};

const signedOutSnapshot: AuthenticationSnapshot = {
  authenticationState: { status: "unauthenticated" },
  featureFlags: failClosedFeatureFlags,
};

function errorSnapshot(failure: SessionFailure): AuthenticationSnapshot {
  return {
    authenticationState: { status: "error", failure },
    featureFlags: failClosedFeatureFlags,
  };
}

export function createAuthenticationClientController(
  provider: AuthenticationProvider,
  trustedSessions: IdentitySessionResolutionService,
): AuthenticationClientController {
  return {
    signIn: (request) => provider.signIn(request),
    signOut: () => provider.signOut(),

    start(listener) {
      let active = true;
      let generation = 0;
      listener(loadingSnapshot);

      const unsubscribe = provider.subscribe(
        (identity) => {
          if (!active) return;
          const resolutionGeneration = ++generation;
          if (!identity) {
            listener(signedOutSnapshot);
            return;
          }

          listener(loadingSnapshot);
          void trustedSessions
            .resolveIdentity(identity)
            .then((result) => {
              if (!active || resolutionGeneration !== generation) return;

              if (result.ok) {
                listener({
                  authenticationState: {
                    status: "authenticated",
                    user: result.user,
                  },
                  featureFlags: result.featureFlags,
                });
                return;
              }

              listener(errorSnapshot(result.failure));
            })
            .catch(() => {
              if (!active || resolutionGeneration !== generation) return;
              listener(
                errorSnapshot({
                  category: "provider_error",
                  reason: "provider_unavailable",
                }),
              );
            });
        },
        () => {
          generation += 1;
          if (!active) return;
          listener(
            errorSnapshot({
              category: "provider_error",
              reason: "provider_unavailable",
            }),
          );
        },
      );

      return () => {
        active = false;
        generation += 1;
        unsubscribe();
      };
    },
  };
}
