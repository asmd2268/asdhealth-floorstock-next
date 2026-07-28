import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  switchFacility: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookieSet })),
}));
vi.mock("@/server/session/composition", () => ({
  getServerSessionService: () => ({ switchFacility: mocks.switchFacility }),
}));
vi.mock("@/server/session/environment", () => ({
  getServerSessionEnvironment: () => ({
    allowedOrigin: "http://localhost:3000",
  }),
}));

import { POST } from "./route";

const cookieValue = `${"a".repeat(43)}.${"b".repeat(43)}`;

function request(cookieHeader: string | null) {
  const body = JSON.stringify({ facilityId: "facility-2" });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "content-length": String(new TextEncoder().encode(body).byteLength),
    origin: "http://localhost:3000",
    "sec-fetch-site": "same-origin",
    "x-asdhealth-session-action": "switch-facility",
  };
  if (cookieHeader !== null) headers.cookie = cookieHeader;
  return new Request("http://localhost:3000/api/auth/session/facility", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  mocks.cookieSet.mockReset();
  mocks.switchFacility.mockReset();
  mocks.switchFacility.mockResolvedValue({
    ok: true,
    value: {
      activeFacilityId: "facility-2",
      cookieValue,
      expiresAtMilliseconds: Date.now() + 60_000,
    },
  });
});

describe("facility session route", () => {
  it.each([
    null,
    `asdhealth_session=${cookieValue}; asdhealth_session=${cookieValue}`,
    ` asdhealth_session =${cookieValue}`,
    "asdhealth_session=malformed",
    `unrelated=${"x".repeat(8_193)}`,
  ])("rejects a missing or non-canonical session cookie", async (cookie) => {
    const response = await POST(request(cookie));
    expect(response.status).toBe(401);
    expect(mocks.switchFacility).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "asdhealth_session",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("passes only the canonical cookie and requested target to the service", async () => {
    const response = await POST(
      request(`unrelated=value; asdhealth_session=${cookieValue}`),
    );
    expect(response.status).toBe(200);
    expect(mocks.switchFacility).toHaveBeenCalledWith(
      cookieValue,
      "facility-2",
    );
    expect(await response.json()).toEqual({
      ok: true,
      facility: { id: "facility-2" },
    });
  });

  it("rejects cross-site requests before parsing or clearing session cookies", async () => {
    const crossSite = request(null);
    crossSite.headers.set("origin", "https://attacker.example");
    crossSite.headers.set("sec-fetch-site", "cross-site");
    const response = await POST(crossSite);
    expect(response.status).toBe(403);
    expect(mocks.switchFacility).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
