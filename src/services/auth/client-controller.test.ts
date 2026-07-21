import { describe, expect, it, vi } from "vitest";

import { failClosedFeatureFlags } from "@/config/platform";
import type {
  ProviderIdentity,
  SessionResolutionResult,
} from "@/domain/auth/types";
import type {
  AuthenticationProvider,
  IdentitySessionResolutionService,
} from "@/services/contracts/auth";

import { createAuthenticationClientController } from "./client-controller";
import { createIdentitySessionResolutionService } from "./session-service";

const identity = {
  uid: "firebase-user-1",
  email: "user@example.com",
  displayName: "Example User",
} as const;

const scope = {
  kind: "facility",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
} as const;

const successfulSession: SessionResolutionResult = {
  ok: true,
  user: {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    tenantId: "tenant-1",
    platformId: scope.platformId,
    organizationId: scope.organizationId,
    facilityIds: [scope.facilityId],
    activeFacilityId: scope.facilityId,
    activeScope: scope,
    roleAssignments: [{ role: "pharmacy_staff", scope }],
    explicitPermissionOverrides: [],
    accountStatus: "active",
  },
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: false,
    controlled_medicines: false,
  },
};

function providerHarness() {
  let identityListener: ((value: ProviderIdentity | null) => void) | undefined;
  let errorListener: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const provider: AuthenticationProvider = {
    getIdentity: vi.fn().mockResolvedValue({ ok: true, identity: null }),
    subscribe: vi.fn((listener, onError) => {
      identityListener = listener;
      errorListener = () => onError?.("provider_unavailable");
      return unsubscribe;
    }),
    signIn: vi.fn().mockResolvedValue({ ok: true, identity }),
    signOut: vi.fn().mockResolvedValue({ ok: true }),
  };
  return {
    provider,
    emit: (value: ProviderIdentity | null) => identityListener?.(value),
    emitError: () => errorListener?.(),
    unsubscribe,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("authentication client controller", () => {
  it("emits loading while trusted session resolution is pending", async () => {
    const harness = providerHarness();
    let finish: ((result: SessionResolutionResult) => void) | undefined;
    const sessions: IdentitySessionResolutionService = {
      resolveIdentity: vi.fn(
        () =>
          new Promise<SessionResolutionResult>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const listener = vi.fn();
    createAuthenticationClientController(harness.provider, sessions).start(
      listener,
    );

    harness.emit(identity);
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: { status: "loading" },
      featureFlags: failClosedFeatureFlags,
    });

    finish?.(successfulSession);
    await flushPromises();
    expect(listener.mock.calls.at(-1)?.[0].authenticationState.status).toBe(
      "authenticated",
    );
  });

  it("fails closed when a Firebase identity has no trusted profile", async () => {
    const harness = providerHarness();
    const sessions = createIdentitySessionResolutionService({
      userProfiles: { getByUid: vi.fn().mockResolvedValue(null) },
      roleAssignments: { listByUid: vi.fn().mockResolvedValue([]) },
      tenantDirectories: { getByTenantId: vi.fn().mockResolvedValue(null) },
    });
    const listener = vi.fn();
    createAuthenticationClientController(harness.provider, sessions).start(
      listener,
    );

    harness.emit(identity);
    await flushPromises();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: {
        status: "error",
        failure: { category: "access_denied", reason: "profile_not_found" },
      },
      featureFlags: failClosedFeatureFlags,
    });
  });

  it("authenticates only after a valid trusted session succeeds", async () => {
    const harness = providerHarness();
    const sessions: IdentitySessionResolutionService = {
      resolveIdentity: vi.fn().mockResolvedValue(successfulSession),
    };
    const listener = vi.fn();
    createAuthenticationClientController(harness.provider, sessions).start(
      listener,
    );

    harness.emit(identity);
    await flushPromises();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: {
        status: "authenticated",
        user: successfulSession.ok ? successfulSession.user : undefined,
      },
      featureFlags: successfulSession.ok
        ? successfulSession.featureFlags
        : undefined,
    });
  });

  it("ignores stale resolution after sign-out", async () => {
    const harness = providerHarness();
    let finish: ((result: SessionResolutionResult) => void) | undefined;
    const sessions: IdentitySessionResolutionService = {
      resolveIdentity: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const listener = vi.fn();
    createAuthenticationClientController(harness.provider, sessions).start(
      listener,
    );

    harness.emit(identity);
    harness.emit(null);
    finish?.(successfulSession);
    await flushPromises();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: { status: "unauthenticated" },
      featureFlags: failClosedFeatureFlags,
    });
  });

  it("unsubscribes and suppresses pending updates after cleanup", async () => {
    const harness = providerHarness();
    const sessions: IdentitySessionResolutionService = {
      resolveIdentity: vi.fn().mockResolvedValue(successfulSession),
    };
    const listener = vi.fn();
    const stop = createAuthenticationClientController(
      harness.provider,
      sessions,
    ).start(listener);
    stop();
    harness.emit(identity);
    harness.emitError();
    await flushPromises();

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("normalizes provider subscription failures into an error snapshot", () => {
    const harness = providerHarness();
    const sessions: IdentitySessionResolutionService = {
      resolveIdentity: vi.fn(),
    };
    const listener = vi.fn();
    createAuthenticationClientController(harness.provider, sessions).start(
      listener,
    );

    harness.emitError();
    expect(listener).toHaveBeenLastCalledWith({
      authenticationState: {
        status: "error",
        failure: {
          category: "provider_error",
          reason: "provider_unavailable",
        },
      },
      featureFlags: failClosedFeatureFlags,
    });
  });
});
