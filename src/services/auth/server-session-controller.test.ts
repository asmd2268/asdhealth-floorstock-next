import { describe, expect, it, vi } from "vitest";

import { failClosedFeatureFlags } from "@/config/platform";
import type { ProviderIdentity } from "@/domain/auth/types";
import type { AuthenticationProvider } from "@/services/contracts/auth";
import type {
  BrowserServerSessionTransport,
  IdentityTokenProvider,
} from "@/services/contracts/server-session";

import { createServerSessionAuthenticationController } from "./server-session-controller";

const identity: ProviderIdentity = {
  uid: "user-1",
  email: "user@example.com",
  displayName: "User",
};

function harness() {
  let emit: ((identity: ProviderIdentity | null) => void) | undefined;
  const provider: AuthenticationProvider & IdentityTokenProvider = {
    getIdentity: vi.fn(),
    getIdentityToken: vi.fn().mockResolvedValue({ ok: true, token: "token" }),
    signIn: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn((listener) => {
      emit = listener;
      return vi.fn();
    }),
  };
  const transport: BrowserServerSessionTransport = {
    create: vi.fn().mockResolvedValue({ ok: true }),
    revoke: vi.fn(),
  };
  return {
    provider,
    transport,
    emit: (value: ProviderIdentity | null) => emit?.(value),
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("server-session authentication controller", () => {
  it("stays loading until the server verifies trusted session data", async () => {
    const value = harness();
    let resolveTransport: ((value: { ok: true }) => void) | undefined;
    vi.mocked(value.transport.create).mockReturnValue(
      new Promise((resolve) => {
        resolveTransport = resolve;
      }),
    );
    const listener = vi.fn();
    const established = vi.fn();
    createServerSessionAuthenticationController(
      value.provider,
      value.transport,
      established,
    ).start(listener);
    value.emit(identity);
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: { status: "loading" },
      featureFlags: failClosedFeatureFlags,
    });
    expect(established).not.toHaveBeenCalled();
    resolveTransport?.({ ok: true });
    await flush();
    expect(established).toHaveBeenCalledOnce();
  });

  it("renders access denied for an identity rejected by the trusted server boundary", async () => {
    const value = harness();
    vi.mocked(value.transport.create).mockResolvedValue({
      ok: false,
      reason: "access_denied",
    });
    const listener = vi.fn();
    createServerSessionAuthenticationController(
      value.provider,
      value.transport,
      vi.fn(),
    ).start(listener);
    value.emit(identity);
    await flush();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: {
        status: "error",
        failure: { category: "access_denied", reason: "identity_mismatch" },
      },
      featureFlags: failClosedFeatureFlags,
    });
  });

  it("never silently falls back after the Firebase identity signs out", async () => {
    const value = harness();
    const listener = vi.fn();
    const established = vi.fn();
    createServerSessionAuthenticationController(
      value.provider,
      value.transport,
      established,
    ).start(listener);
    value.emit(identity);
    value.emit(null);
    await flush();
    expect(established).not.toHaveBeenCalled();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: { status: "unauthenticated" },
      featureFlags: failClosedFeatureFlags,
    });
  });

  it("revokes a server cookie before Firebase sign-out from access-denied UI", async () => {
    const value = harness();
    vi.mocked(value.transport.revoke).mockResolvedValue({ ok: true });
    vi.mocked(value.provider.signOut).mockResolvedValue({ ok: true });
    const controller = createServerSessionAuthenticationController(
      value.provider,
      value.transport,
      vi.fn(),
    );
    await expect(controller.signOut()).resolves.toEqual({ ok: true });
    expect(value.transport.revoke).toHaveBeenCalledOnce();
    expect(value.provider.signOut).toHaveBeenCalledOnce();
    expect(
      vi.mocked(value.transport.revoke).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(value.provider.signOut).mock.invocationCallOrder[0],
    );
  });
});
