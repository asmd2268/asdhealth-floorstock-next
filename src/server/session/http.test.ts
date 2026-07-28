import { describe, expect, it, vi } from "vitest";

import type { ServerSessionService } from "./types";
import {
  createClearSessionCookie,
  handleCreateSessionRequest,
  handleDeleteSessionRequest,
  handleProtectedApiRequest,
  handleSwitchFacilityRequest,
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
    switchFacility: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        activeFacilityId: "facility-2",
        cookieValue,
        expiresAtMilliseconds: 1_900_000_000_000,
      },
    }),
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

function switchRequest(
  headers: Record<string, string> = {},
  body: unknown = { facilityId: "facility-2" },
) {
  const serialized = JSON.stringify(body);
  return new Request(origin + "/api/auth/session/facility", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(serialized).byteLength),
      origin,
      "sec-fetch-site": "same-origin",
      "x-asdhealth-session-action": "switch-facility",
      ...headers,
    },
    body: serialized,
  });
}

function rawSwitchRequest(body: string, headers: Record<string, string> = {}) {
  return new Request(origin + "/api/auth/session/facility", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      origin,
      "sec-fetch-site": "same-origin",
      "x-asdhealth-session-action": "switch-facility",
      ...headers,
    },
    body,
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

  it("rotates a facility session and returns only sanitized context with the absolute expiry", async () => {
    const boundary = service();
    const result = await handleSwitchFacilityRequest(
      switchRequest(),
      cookieValue,
      boundary,
      origin,
      true,
      () => 1_899_999_990_000,
    );
    expect(boundary.switchFacility).toHaveBeenCalledWith(
      cookieValue,
      "facility-2",
    );
    expect(await result.response.json()).toEqual({
      ok: true,
      facility: { id: "facility-2" },
    });
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.cookie).toMatchObject({
      name: "__Host-asdhealth_session",
      value: cookieValue,
      options: {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        maxAge: 10,
        expires: new Date(1_900_000_000_000),
        priority: "high",
      },
    });
    expect(result.cookie?.options).not.toHaveProperty("domain");
  });

  it("rejects malformed targets and normalized authorization failures without enumeration", async () => {
    const boundary = service();
    const malformed = await handleSwitchFacilityRequest(
      switchRequest({}, { facilityId: "../tenant-2/facility" }),
      cookieValue,
      boundary,
      origin,
      false,
    );
    expect(malformed.response.status).toBe(400);
    expect(await malformed.response.json()).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });

    vi.mocked(boundary.switchFacility).mockResolvedValueOnce({
      ok: false,
      code: "forbidden",
    });
    const forbidden = await handleSwitchFacilityRequest(
      switchRequest(),
      cookieValue,
      boundary,
      origin,
      false,
    );
    const forbiddenBody = await forbidden.response.json();
    expect(forbiddenBody).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(JSON.stringify(forbiddenBody)).not.toContain("facility-2");
    expect(forbidden.clearCookie).toBeUndefined();
  });

  it("enforces Origin, Fetch Metadata, and the operation-specific CSRF header", async () => {
    const boundary = service();
    for (const request of [
      switchRequest({ origin: "https://attacker.example" }),
      switchRequest({ origin: `${origin}, ${origin}` }),
      switchRequest({ origin: `${origin}/path` }),
      switchRequest({ origin: "null" }),
      switchRequest({ origin: "" }),
      switchRequest({ "sec-fetch-site": "cross-site" }),
      switchRequest({ "x-asdhealth-session-action": "sign-out" }),
    ]) {
      const result = await handleSwitchFacilityRequest(
        request,
        cookieValue,
        boundary,
        origin,
        false,
      );
      expect(result.response.status).toBe(403);
    }
    expect(boundary.switchFacility).not.toHaveBeenCalled();
  });

  it("requires strict JSON type, exact declared length, and a bounded body", async () => {
    const boundary = service();
    const validBody = JSON.stringify({ facilityId: "facility-2" });
    for (const request of [
      new Request(origin + "/api/auth/session/facility", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "sec-fetch-site": "same-origin",
          "x-asdhealth-session-action": "switch-facility",
        },
        body: validBody,
      }),
      switchRequest({ "content-type": "text/plain" }),
      switchRequest({ "content-length": "1, 2" }),
      switchRequest({ "content-length": "1" }),
      switchRequest({}, { facilityId: "f".repeat(12_289) }),
    ]) {
      const result = await handleSwitchFacilityRequest(
        request,
        cookieValue,
        boundary,
        origin,
        false,
      );
      expect(result.response.status).toBe(400);
    }
    expect(boundary.switchFacility).not.toHaveBeenCalled();
  });

  it("rejects duplicate or escaped-duplicate JSON keys and trailing content", async () => {
    const boundary = service();
    for (const body of [
      '{"facilityId":"facility-1","facilityId":"facility-2"}',
      '{"facilityId":"facility-1","facility\\u0049d":"facility-2"}',
      '{"facilityId":"facility-2"}true',
    ]) {
      const result = await handleSwitchFacilityRequest(
        rawSwitchRequest(body),
        cookieValue,
        boundary,
        origin,
        false,
      );
      expect(result.response.status).toBe(400);
    }
    expect(boundary.switchFacility).not.toHaveBeenCalled();
  });

  it("rejects non-canonical and overflow Content-Length values", async () => {
    const boundary = service();
    for (const contentLength of [
      "-1",
      "+1",
      "1.0",
      "1e2",
      "1, 2",
      "01",
      "1 2",
      "9".repeat(400),
      String(12_289),
    ]) {
      const result = await handleSwitchFacilityRequest(
        switchRequest({ "content-length": contentLength }),
        cookieValue,
        boundary,
        origin,
        false,
      );
      expect(result.response.status).toBe(400);
    }
    expect(boundary.switchFacility).not.toHaveBeenCalled();
  });

  it("compares declared lengths as UTF-8 bytes", async () => {
    const boundary = service();
    const body = JSON.stringify({ idToken: "tøken" });
    const request = new Request(origin + "/api/auth/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(new TextEncoder().encode(body).byteLength),
        origin,
        "sec-fetch-site": "same-origin",
      },
      body,
    });
    const result = await handleCreateSessionRequest(
      request,
      undefined,
      boundary,
      origin,
      false,
    );
    expect(result.response.status).toBe(201);
    expect(boundary.create).toHaveBeenCalledWith("tøken", undefined);
  });

  it("clears an invalid switched session with matching cookie attributes", async () => {
    const boundary = service();
    vi.mocked(boundary.switchFacility).mockResolvedValue({
      ok: false,
      code: "unauthenticated",
    });
    const result = await handleSwitchFacilityRequest(
      switchRequest(),
      cookieValue,
      boundary,
      origin,
      true,
    );
    expect(result.clearCookie).toEqual(createClearSessionCookie(true));
    expect(result.response.status).toBe(401);
  });
});
