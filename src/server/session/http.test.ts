import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "./types";
import {
  createClearSessionCookie,
  handleCreateSessionRequest,
  handleDeleteSessionRequest,
  handleProtectedApiRequest,
} from "./http";

const origin = "https://floorstock.asdhealth.example";
const cookieValue = `${"a".repeat(43)}.${"b".repeat(43)}`;

function service(): ServerSessionService {
  return {
    create: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        cookieValue,
        expiresAtMilliseconds: 1_900_000_000_000,
      },
    }),
    resolve: vi.fn(),
    authorize: vi.fn().mockResolvedValue({ ok: false, code: "forbidden" }),
    revoke: vi.fn().mockResolvedValue({ ok: true, value: null }),
  };
}

function createRequest(
  headers: Record<string, string> = {},
  body: unknown = { idToken: "token" },
) {
  return new Request(origin + "/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("server session HTTP boundary", () => {
  it("creates a hardened production cookie without returning tokens or trusted data", async () => {
    const boundary = service();
    const result = await handleCreateSessionRequest(
      createRequest(),
      undefined,
      boundary,
      origin,
      true,
    );
    expect(result.response.status).toBe(201);
    expect(result.cookie).toMatchObject({
      name: "__Host-asdhealth_session",
      value: cookieValue,
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        priority: "high",
      },
    });
    expect(result.cookie?.options).not.toHaveProperty("domain");
    expect(await result.response.json()).toEqual({ ok: true });
  });

  it("uses a distinct non-Secure local cookie without weakening production attributes", () => {
    const development = createClearSessionCookie(false);
    expect(development).toMatchObject({
      name: "asdhealth_session",
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 0,
      },
    });
    expect(development.options).not.toHaveProperty("domain");
  });

  it("denies CSRF attempts and strict-schema/open-redirect input", async () => {
    const boundary = service();
    const crossOrigin = await handleCreateSessionRequest(
      createRequest({ origin: "https://attacker.example" }),
      undefined,
      boundary,
      origin,
      false,
    );
    const missingFetchMetadata = await handleCreateSessionRequest(
      createRequest({ "sec-fetch-site": "cross-site" }),
      undefined,
      boundary,
      origin,
      false,
    );
    const redirectAttempt = await handleCreateSessionRequest(
      createRequest(
        {},
        { idToken: "token", returnTo: "https://attacker.example" },
      ),
      undefined,
      boundary,
      origin,
      false,
    );
    expect(crossOrigin.response.status).toBe(403);
    expect(missingFetchMetadata.response.status).toBe(403);
    expect(redirectAttempt.response.status).toBe(400);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("requires same-origin plus a non-form custom header for sign-out", async () => {
    const boundary = service();
    const missingCsrfGuard = await handleDeleteSessionRequest(
      new Request(origin + "/api/auth/session", {
        method: "DELETE",
        headers: { origin, "sec-fetch-site": "same-origin" },
      }),
      cookieValue,
      boundary,
      origin,
      true,
    );
    expect(missingCsrfGuard.response.status).toBe(403);
    expect(boundary.revoke).not.toHaveBeenCalled();

    const accepted = await handleDeleteSessionRequest(
      new Request(origin + "/api/auth/session", {
        method: "DELETE",
        headers: {
          origin,
          "sec-fetch-site": "same-origin",
          "x-asdhealth-session-action": "sign-out",
        },
      }),
      cookieValue,
      boundary,
      origin,
      true,
    );
    expect(accepted.response.status).toBe(200);
    expect(accepted.clearCookie).toMatchObject({
      name: "__Host-asdhealth_session",
      value: "",
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        maxAge: 0,
      },
    });
  });

  it("rejects malformed, combined, oversized, or path-bearing Origin values", async () => {
    const boundary = service();
    for (const invalidOrigin of [
      `${origin}, ${origin}`,
      `${origin}/path`,
      "null",
      `https://${"a".repeat(2_050)}.example`,
      "https://proxy.asdhealth.example",
    ]) {
      const result = await handleCreateSessionRequest(
        createRequest({ origin: invalidOrigin }),
        undefined,
        boundary,
        origin,
        true,
      );
      expect(result.response.status).toBe(403);
    }
    const mismatchedRequestOrigin = await handleCreateSessionRequest(
      new Request("https://proxy.asdhealth.example/api/auth/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ idToken: "token" }),
      }),
      undefined,
      boundary,
      origin,
      true,
    );
    expect(mismatchedRequestOrigin.response.status).toBe(403);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("bounds request bodies even when Content-Length is absent or misleading", async () => {
    const boundary = service();
    const oversized = await handleCreateSessionRequest(
      createRequest({}, { idToken: "x".repeat(12_289) }),
      undefined,
      boundary,
      origin,
      true,
    );
    const invalidLength = await handleCreateSessionRequest(
      createRequest({ "content-length": "1, 2" }),
      undefined,
      boundary,
      origin,
      true,
    );
    expect(oversized.response.status).toBe(400);
    expect(invalidLength.response.status).toBe(400);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("re-checks the declared protected API permission and returns only a safe denial", async () => {
    const boundary = service();
    const response = await handleProtectedApiRequest(cookieValue, boundary, {
      resource: "dashboard",
      action: "read",
    });
    expect(boundary.authorize).toHaveBeenCalledWith(cookieValue, {
      resource: "dashboard",
      action: "read",
    });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      JSON.stringify({ ok: false, error: { code: "forbidden" } }),
    );
  });
});
