import { failClosedFeatureFlags } from "@/config/platform";
import type { SessionFailure } from "@/domain/auth/types";
import type {
  AuthenticationClientController,
  AuthenticationProvider,
  AuthenticationSnapshot,
} from "@/services/contracts/auth";
import type {
  BrowserServerSessionTransport,
  IdentityTokenProvider,
} from "@/services/contracts/server-session";

const loading: AuthenticationSnapshot = {
  authenticationState: { status: "loading" },
  featureFlags: failClosedFeatureFlags,
};
const signedOut: AuthenticationSnapshot = {
  authenticationState: { status: "unauthenticated" },
  featureFlags: failClosedFeatureFlags,
};
const failure = (value: SessionFailure): AuthenticationSnapshot => ({
  authenticationState: { status: "error", failure: value },
  featureFlags: failClosedFeatureFlags,
});

export function createServerSessionAuthenticationController(
  provider: AuthenticationProvider & IdentityTokenProvider,
  transport: BrowserServerSessionTransport,
  sessionEstablished: () => void,
): AuthenticationClientController {
  return {
    signIn: (request) => provider.signIn(request),
    signOut: () => signOutServerSession(provider, transport),
    start(listener) {
      let active = true;
      let generation = 0;
      listener(loading);
      const unsubscribe = provider.subscribe(
        (identity) => {
          const currentGeneration = ++generation;
          if (!active) return;
          if (!identity) {
            listener(signedOut);
            return;
          }
          listener(loading);
          void provider
            .getIdentityToken()
            .then((tokenResult) =>
              tokenResult.ok
                ? transport.create(tokenResult.token)
                : { ok: false as const, reason: tokenResult.reason },
            )
            .then((result) => {
              if (!active || currentGeneration !== generation) return;
              if (result.ok) {
                sessionEstablished();
                return;
              }
              listener(
                failure(
                  result.reason === "access_denied" ||
                    result.reason === "unauthenticated"
                    ? { category: "access_denied", reason: "identity_mismatch" }
                    : {
                        category: "provider_error",
                        reason: "provider_unavailable",
                      },
                ),
              );
            })
            .catch(() => {
              if (!active || currentGeneration !== generation) return;
              listener(
                failure({
                  category: "provider_error",
                  reason: "provider_unavailable",
                }),
              );
            });
        },
        () => {
          generation += 1;
          if (active) {
            listener(
              failure({
                category: "provider_error",
                reason: "provider_unavailable",
              }),
            );
          }
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

export async function signOutServerSession(
  provider: Pick<AuthenticationProvider, "signOut">,
  transport: Pick<BrowserServerSessionTransport, "revoke">,
): ReturnType<AuthenticationProvider["signOut"]> {
  const revoked = await transport.revoke();
  if (!revoked.ok && revoked.reason !== "unauthenticated") {
    return { ok: false, reason: "provider_unavailable" };
  }
  return provider.signOut();
}
