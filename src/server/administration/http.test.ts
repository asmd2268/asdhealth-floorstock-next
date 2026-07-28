import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import type { AdministrationContext } from "@/domain/administration/types";
import {
  handleAdministrationMutation,
  type AdministrationHttpDependencies,
} from "./http";

const context: AdministrationContext = {
  principal: {
    kind: "tenant_admin",
    scope: "unrestricted",
    uid: "admin-1",
    platformId: "platform-1",
    tenantId: "tenant-1",
  },
  tenantId: "tenant-1",
  platformId: "platform-1",
  sessionUid: "admin-1",
};

function dependencies(
  result: Awaited<
    ReturnType<AdministrationHttpDependencies["resolveContext"]>
  > = { ok: true, value: context },
): AdministrationHttpDependencies {
  return {
    allowedOrigin: () => "https://app.example",
    resolveContext: vi.fn().mockResolvedValue(result),
  };
}

function request(
  text = '{"value":"safe"}',
  overrides: Record<string, string> = {},
) {
  return new Request("https://app.example/api/admin/test", {
    method: "PATCH",
    headers: {
      origin: "https://app.example",
      "sec-fetch-site": "same-origin",
      "x-asdhealth-admin-action": "1",
      "x-request-id": "request-1",
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(text).byteLength),
      ...overrides,
    },
    body: text,
  });
}

describe("administration mutation HTTP boundary", () => {
  it("uses the application session origin rather than the external provisioning origin", () => {
    const source = readFileSync(new URL("./http.ts", import.meta.url), "utf8");
    expect(source).toContain("getServerSessionEnvironment().allowedOrigin");
    expect(source).not.toContain("getFirebaseAdminEnvironment");
  });

  it("accepts a bounded same-origin request and supplies only server context", async () => {
    const operation = vi.fn().mockResolvedValue({ ok: true });
    const result = await handleAdministrationMutation(
      request(),
      z.object({ value: z.literal("safe") }).strict(),
      operation,
      dependencies(),
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(operation).toHaveBeenCalledWith(context, "request-1", {
      value: "safe",
    });
  });

  it.each<[string, Record<string, string>, number, string?]>([
    ["origin", { origin: "https://evil.example" }, 403],
    ["request origin", {}, 403, "https://other.example/api/admin/test"],
    ["fetch metadata", { "sec-fetch-site": "cross-site" }, 403],
    ["csrf", { "x-asdhealth-admin-action": "0" }, 403],
    [
      "content type",
      { "content-type": "application/json; charset=utf-8" },
      400,
    ],
    ["missing length", { "content-length": "" }, 400],
    ["ambiguous length", { "content-length": "+16" }, 400],
    ["request id", { "x-request-id": " ../bad" }, 400],
  ])("rejects %s attacks", async (_name, headers, status, url) => {
    const base = request(undefined, headers as Record<string, string>);
    const candidate = url ? new Request(url as string, base) : base;
    const result = await handleAdministrationMutation(
      candidate,
      z.object({ value: z.string() }),
      vi.fn(),
      dependencies(),
    );
    expect(result.status).toBe(status);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it.each<[string, number, Record<string, string>?]>([
    ['{"value":"one","value":"two"}', 400],
    ['{"value":', 400],
    ['{"value":"safe"}', 400, { "content-length": "1" }],
    ['{"value":"safe"}', 400, { "content-length": "99999" }],
  ])(
    "rejects malformed, duplicate, or mismatched request bodies",
    async (text, status, headers: Record<string, string> = {}) => {
      const result = await handleAdministrationMutation(
        request(text, headers),
        z.object({ value: z.string() }).strict(),
        vi.fn(),
        dependencies(),
      );
      expect(result.status).toBe(status);
    },
  );

  it("normalizes authentication, authorization, provider, and operation failures", async () => {
    for (const code of [
      "unauthenticated",
      "forbidden",
      "provider_unavailable",
    ] as const) {
      const result = await handleAdministrationMutation(
        request(),
        z.object({ value: z.string() }),
        vi.fn(),
        dependencies({ ok: false, code }),
      );
      expect([401, 403, 503]).toContain(result.status);
      expect(await result.text()).not.toContain("Firebase");
    }
    const conflict = await handleAdministrationMutation(
      request(),
      z.object({ value: z.string() }),
      vi.fn().mockResolvedValue({ ok: false, code: "conflict" }),
      dependencies(),
    );
    expect(conflict.status).toBe(409);
    const missing = await handleAdministrationMutation(
      request(),
      z.object({ value: z.string() }),
      vi.fn().mockResolvedValue({ ok: false, code: "not_found" }),
      dependencies(),
    );
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });

  it("rejects malformed UTF-8 before JSON validation", async () => {
    const bytes = new Uint8Array([
      0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
    ]);
    const malformed = new Request("https://app.example/api/admin/test", {
      method: "PATCH",
      headers: {
        origin: "https://app.example",
        "sec-fetch-site": "same-origin",
        "x-asdhealth-admin-action": "1",
        "x-request-id": "request-1",
        "content-type": "application/json",
        "content-length": String(bytes.byteLength),
      },
      body: bytes,
    });
    const result = await handleAdministrationMutation(
      malformed,
      z.object({ x: z.string() }),
      vi.fn(),
      dependencies(),
    );
    expect(result.status).toBe(400);
  });
});
