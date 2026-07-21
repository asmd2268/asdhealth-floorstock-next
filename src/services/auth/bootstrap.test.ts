import { describe, expect, it, vi } from "vitest";

import type { SessionResolutionService } from "@/services/contracts/auth";

import { resolveInitialAuthenticationState } from "./bootstrap";
import { explicitDemoSessionService } from "./demo-session";

function service(
  result: Awaited<ReturnType<SessionResolutionService["resolve"]>>,
) {
  return { resolve: vi.fn().mockResolvedValue(result) };
}

describe("authentication bootstrap", () => {
  it("does not use demo identity in production mode", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demo = service(await explicitDemoSessionService.resolve());

    await expect(
      resolveInitialAuthenticationState(false, production, demo),
    ).resolves.toEqual({ status: "unauthenticated" });
    expect(production.resolve).toHaveBeenCalledOnce();
    expect(demo.resolve).not.toHaveBeenCalled();
  });

  it("uses demo identity only when the explicit gate is enabled", async () => {
    const production = service({
      ok: false,
      failure: { category: "access_denied", reason: "unauthenticated" },
    });
    const demoResult = await explicitDemoSessionService.resolve();
    const demo = service(demoResult);

    const state = await resolveInitialAuthenticationState(
      true,
      production,
      demo,
    );
    expect(state.status).toBe("authenticated");
    expect(production.resolve).not.toHaveBeenCalled();
    expect(demo.resolve).toHaveBeenCalledOnce();
  });
});
