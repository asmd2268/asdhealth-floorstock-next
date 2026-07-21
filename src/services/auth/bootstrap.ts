import type {
  AuthenticationState,
  SessionResolutionResult,
} from "@/domain/auth/types";
import { failClosedFeatureFlags } from "@/config/platform";
import type { FeatureFlagSet } from "@/domain/platform/types";
import type { SessionResolutionService } from "@/services/contracts/auth";

function toAuthenticationState(
  result: SessionResolutionResult,
): AuthenticationState {
  if (result.ok) return { status: "authenticated", user: result.user };
  if (result.failure.reason === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  return { status: "error", failure: result.failure };
}

export interface ApplicationBootstrap {
  authenticationState: AuthenticationState;
  featureFlags: FeatureFlagSet;
  demoEnabled: boolean;
}

export async function resolveApplicationBootstrap(
  demoEnabled: boolean,
  productionSessions: SessionResolutionService,
  loadDemoSessions: () => Promise<SessionResolutionService>,
): Promise<ApplicationBootstrap> {
  // The environment gate is resolved on the server. Production never attempts
  // to recover a missing session with demo identity or client-provided claims.
  const service = demoEnabled ? await loadDemoSessions() : productionSessions;
  const result = await service.resolve();

  return {
    authenticationState: toAuthenticationState(result),
    featureFlags: result.ok ? result.featureFlags : failClosedFeatureFlags,
    demoEnabled,
  };
}
