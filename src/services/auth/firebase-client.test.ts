// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { ProviderIdentity } from "@/domain/auth/types";
import type { AuthenticationProvider } from "@/services/contracts/auth";
import type { TrustedSessionRepositoryAdapters } from "@/services/firebase/trusted-session-repositories";

import { createProductionFirebaseAuthenticationController } from "./firebase-client";

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("production Firebase session composition", () => {
  it("uses trusted repositories and ignores browser authorization state", async () => {
    let emitIdentity: ((identity: ProviderIdentity | null) => void) | undefined;
    const provider: AuthenticationProvider = {
      getIdentity: vi.fn().mockResolvedValue({ ok: true, identity: null }),
      subscribe: vi.fn((listener) => {
        emitIdentity = listener;
        return vi.fn();
      }),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
    const getByUid = vi.fn().mockResolvedValue(null);
    const repositories: TrustedSessionRepositoryAdapters = {
      userProfiles: { getByUid },
      roleAssignments: { listByUid: vi.fn().mockResolvedValue([]) },
      tenantDirectories: { getByTenantId: vi.fn().mockResolvedValue(null) },
    };
    localStorage.setItem("role", "master");
    localStorage.setItem("tenantId", "attacker-tenant");

    const listener = vi.fn();
    createProductionFirebaseAuthenticationController(
      provider,
      repositories,
    ).start(listener);
    emitIdentity?.({
      uid: "firebase-user-1",
      email: "user@example.com",
      displayName: "Example User",
      customClaims: { role: "master", tenantId: "attacker-tenant" },
    } as ProviderIdentity);
    await flushPromises();

    expect(getByUid).toHaveBeenCalledWith("firebase-user-1");
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        authenticationState: {
          status: "error",
          failure: { category: "access_denied", reason: "profile_not_found" },
        },
      }),
    );
  });
});
