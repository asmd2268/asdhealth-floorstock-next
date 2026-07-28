// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { ProviderIdentity } from "@/domain/auth/types";
import type { AuthenticationProvider } from "@/services/contracts/auth";
import type {
  BrowserServerSessionTransport,
  IdentityTokenProvider,
} from "@/services/contracts/server-session";

import { createProductionFirebaseAuthenticationController } from "./firebase-client";

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("production Firebase session composition", () => {
  it("sends only the provider token to the server transport and ignores browser authorization state", async () => {
    let emitIdentity: ((identity: ProviderIdentity | null) => void) | undefined;
    const provider: AuthenticationProvider & IdentityTokenProvider = {
      getIdentity: vi.fn().mockResolvedValue({ ok: true, identity: null }),
      getIdentityToken: vi
        .fn()
        .mockResolvedValue({ ok: true, token: "id-token" }),
      subscribe: vi.fn((listener) => {
        emitIdentity = listener;
        return vi.fn();
      }),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
    const transport: BrowserServerSessionTransport = {
      create: vi.fn().mockResolvedValue({ ok: true }),
      switchFacility: vi.fn(),
      revoke: vi.fn(),
    };
    const established = vi.fn();
    localStorage.setItem("role", "master");
    localStorage.setItem("tenantId", "attacker-tenant");

    createProductionFirebaseAuthenticationController(
      provider,
      transport,
      established,
    ).start(vi.fn());
    emitIdentity?.({
      uid: "firebase-user-1",
      email: "user@example.com",
      displayName: "Example User",
    });
    await flushPromises();

    expect(provider.getIdentityToken).toHaveBeenCalledOnce();
    expect(transport.create).toHaveBeenCalledWith("id-token");
    expect(transport.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: "master" }),
    );
    expect(established).toHaveBeenCalledOnce();
  });
});
