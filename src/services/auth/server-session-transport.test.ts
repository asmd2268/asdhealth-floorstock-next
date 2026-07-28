import { describe, expect, it, vi } from "vitest";

import { createBrowserServerSessionTransport } from "./server-session-transport";

describe("browser server-session transport", () => {
  it("exchanges only the ID token using same-origin credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    const transport = createBrowserServerSessionTransport(fetcher);
    await expect(transport.create("firebase-token")).resolves.toEqual({
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "firebase-token" }),
    });
  });

  it("normalizes server failures without exposing response bodies", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("raw provider stack and token", { status: 503 }),
      );
    const result =
      await createBrowserServerSessionTransport(fetcher).create("token");
    expect(result).toEqual({ ok: false, reason: "provider_unavailable" });
    expect(JSON.stringify(result)).not.toContain("raw provider");
  });

  it("uses the operation-specific CSRF guard when revoking a session", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      createBrowserServerSessionTransport(fetcher).revoke(),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "x-asdhealth-session-action": "sign-out" },
    });
  });

  it("sends only the requested facility to the operation-specific switch endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      createBrowserServerSessionTransport(fetcher).switchFacility("facility-2"),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session/facility", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-asdhealth-session-action": "switch-facility",
      },
      body: JSON.stringify({ facilityId: "facility-2" }),
      keepalive: true,
    });
  });
});
