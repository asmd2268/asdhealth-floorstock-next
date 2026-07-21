import type {
  AuthenticationState,
  SessionResolutionResult,
} from "@/domain/auth/types";
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

export async function resolveInitialAuthenticationState(
  demoEnabled: boolean,
  productionSessions: SessionResolutionService,
  demoSessions: SessionResolutionService,
): Promise<AuthenticationState> {
  // The environment gate is resolved on the server. Production never attempts
  // to recover a missing session with demo identity or client-provided claims.
  const service = demoEnabled ? demoSessions : productionSessions;
  return toAuthenticationState(await service.resolve());
}
