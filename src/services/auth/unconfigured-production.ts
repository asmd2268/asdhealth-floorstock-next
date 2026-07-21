import type { SessionResolutionService } from "@/services/contracts/auth";

export const unconfiguredProductionSessionService: SessionResolutionService = {
  async resolve() {
    // Phase 1 intentionally has no production provider adapter. A missing
    // adapter is signed out, never an implicit demo or privileged session.
    return {
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    };
  },
};
