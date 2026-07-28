import { describe, expect, it, vi } from "vitest";

import type { SessionResolutionService } from "@/services/contracts/auth";

import { failClosedFeatureFlags } from "@/config/platform";
import { resolveTrustedDemoGate } from "@/config/public-environment";

import { resolveApplicationBootstrap } from "./bootstrap";
import { explicitDemoSessionService } from "./demo-session";

function service(
  result: Awaited<ReturnType<SessionResolutionService["resolve"]>>,
) {
  return { resolve: vi.fn().mockResolvedValue(result) };
}

function demoLoader(demo: SessionResolutionService) {
  return vi.fn().mockResolvedValue(demo);
}

describe("authentication bootstrap", () => {
  it("keeps production signed out when the public demo flag is true", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demo = service(await explicitDemoSessionService.resolve());
    const loadDemo = demoLoader(demo);
    const trustedGate = resolveTrustedDemoGate("production", "true");

    const bootstrap = await resolveApplicationBootstrap(
      trustedGate,
      production,
      loadDemo,
    );

    expect(bootstrap).toEqual({
      authenticationState: { status: "unauthenticated" },
      featureFlags: failClosedFeatureFlags,
      demoEnabled: false,
    });
    expect(demo.resolve).not.toHaveBeenCalled();
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it("does not use demo identity in production mode", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demo = service(await explicitDemoSessionService.resolve());
    const loadDemo = demoLoader(demo);

    await expect(
      resolveApplicationBootstrap(false, production, loadDemo),
    ).resolves.toEqual({
      authenticationState: { status: "unauthenticated" },
      featureFlags: failClosedFeatureFlags,
      demoEnabled: false,
    });
    expect(production.resolve).toHaveBeenCalledOnce();
    expect(demo.resolve).not.toHaveBeenCalled();
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it("uses demo identity only when the explicit gate is enabled", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demoResult = await explicitDemoSessionService.resolve();
    const demo = service(demoResult);
    const loadDemo = demoLoader(demo);

    const bootstrap = await resolveApplicationBootstrap(
      true,
      production,
      loadDemo,
    );
    expect(bootstrap.authenticationState.status).toBe("authenticated");
    expect(bootstrap.featureFlags).toEqual({
      announcements: true,
      zebra_labels: true,
      new_request: true,
      controlled_medicines: false,
      inventory: false,
    });
    expect(bootstrap.demoEnabled).toBe(true);
    expect(production.resolve).not.toHaveBeenCalled();
    expect(demo.resolve).toHaveBeenCalledOnce();
    expect(loadDemo).toHaveBeenCalledOnce();
  });

  it("enables the explicit demo path only in development with the flag set", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demo = service(await explicitDemoSessionService.resolve());
    const loadDemo = demoLoader(demo);
    const trustedGate = resolveTrustedDemoGate("development", "true");

    const bootstrap = await resolveApplicationBootstrap(
      trustedGate,
      production,
      loadDemo,
    );

    expect(bootstrap.demoEnabled).toBe(true);
    expect(bootstrap.authenticationState.status).toBe("authenticated");
    expect(demo.resolve).toHaveBeenCalledOnce();
    expect(loadDemo).toHaveBeenCalledOnce();
    expect(production.resolve).not.toHaveBeenCalled();
  });

  it("uses trusted production-session flags instead of demo flags", async () => {
    const productionResult = await explicitDemoSessionService.resolve();
    expect(productionResult.ok).toBe(true);
    if (!productionResult.ok) return;

    const productionFlags = {
      announcements: false,
      zebra_labels: false,
      new_request: true,
      controlled_medicines: false,
    } as const;
    const production = service({
      ...productionResult,
      featureFlags: productionFlags,
    });
    const demo = service(productionResult);
    const loadDemo = demoLoader(demo);

    const bootstrap = await resolveApplicationBootstrap(
      false,
      production,
      loadDemo,
    );

    expect(bootstrap.featureFlags).toBe(productionFlags);
    expect(bootstrap.featureFlags).not.toBe(productionResult.featureFlags);
    expect(demo.resolve).not.toHaveBeenCalled();
    expect(loadDemo).not.toHaveBeenCalled();
  });
});
