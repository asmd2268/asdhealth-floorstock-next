import { describe, expect, it, vi } from "vitest";

import { coordinateServerSignOut } from "./server-authenticated-app";

describe("coordinated server sign-out", () => {
  it("revokes the server session before signing out Firebase locally", async () => {
    const order: string[] = [];
    const revoke = vi.fn(async () => {
      order.push("server");
      return { ok: true as const };
    });
    const providerSignOut = vi.fn(async () => {
      order.push("firebase");
      return { ok: true as const };
    });
    const navigate = vi.fn(() => order.push("navigate"));

    await expect(
      coordinateServerSignOut({ revoke }, providerSignOut, navigate),
    ).resolves.toEqual({ ok: true });
    expect(order).toEqual(["server", "firebase", "navigate"]);
  });

  it("can finish Firebase sign-out on retry after the session is already revoked", async () => {
    const providerSignOut = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    await expect(
      coordinateServerSignOut(
        {
          revoke: vi.fn().mockResolvedValue({
            ok: false,
            reason: "unauthenticated",
          }),
        },
        providerSignOut,
        navigate,
      ),
    ).resolves.toEqual({ ok: true });
    expect(providerSignOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not abandon a possibly live server session when revocation is unavailable", async () => {
    const providerSignOut = vi.fn();
    const result = await coordinateServerSignOut(
      {
        revoke: vi.fn().mockResolvedValue({
          ok: false,
          reason: "provider_unavailable",
        }),
      },
      providerSignOut,
      vi.fn(),
    );
    expect(result).toEqual({ ok: false, reason: "provider_unavailable" });
    expect(providerSignOut).not.toHaveBeenCalled();
  });
});
