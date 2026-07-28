import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ProvisioningHttpDependencies } from "./http";
import { handleTrustedProvisioningRequest } from "./http";

const principal = {
  kind: "platform_owner",
  uid: "owner-1",
  platformId: "platform-1",
} as const;

function dependencies(
  principalResult:
    | { ok: true; principal: typeof principal }
    | { ok: false; code: "unauthenticated" } = {
    ok: true,
    principal,
  },
): ProvisioningHttpDependencies {
  return {
    allowedOrigin: () => "https://admin.asdhealth.example",
    principalResolver: () => ({
      resolve: vi.fn().mockResolvedValue(principalResult),
      resolveUid: vi.fn().mockResolvedValue(principalResult),
    }),
  };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.asdhealth.example/api/provision", {
    method: "POST",
    headers: {
      authorization: "Bearer token.value",
      "content-type": "application/json",
      origin: "https://admin.asdhealth.example",
      "x-request-id": "request-1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("trusted provisioning HTTP boundary", () => {
  it("accepts validated same-origin requests and supplies the trusted actor", async () => {
    const operation = vi.fn().mockResolvedValue({ ok: true });
    const response = await handleTrustedProvisioningRequest(
      request({ name: "valid" }),
      z.object({ name: z.literal("valid") }).strict(),
      operation,
      dependencies(),
    );

    expect(response.status).toBe(200);
    expect(operation).toHaveBeenCalledWith(
      { actor: principal, requestId: "request-1" },
      { name: "valid" },
    );
  });

  it("denies cross-origin, unauthenticated, and malformed requests", async () => {
    const schema = z.object({ name: z.string() }).strict();
    const operation = vi.fn();

    const crossOrigin = await handleTrustedProvisioningRequest(
      request({ name: "valid" }, { origin: "https://attacker.example" }),
      schema,
      operation,
      dependencies(),
    );
    const unauthenticated = await handleTrustedProvisioningRequest(
      request({ name: "valid" }),
      schema,
      operation,
      dependencies({ ok: false, code: "unauthenticated" }),
    );
    const malformed = await handleTrustedProvisioningRequest(
      request({ invented: true }),
      schema,
      operation,
      dependencies(),
    );

    expect(crossOrigin.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    expect(malformed.status).toBe(400);
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns safe normalized errors without stack or provider details", async () => {
    const response = await handleTrustedProvisioningRequest(
      request({ name: "valid" }),
      z.object({ name: z.string() }).strict(),
      vi.fn().mockRejectedValue(new Error("raw Firestore document path")),
      dependencies(),
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toBe(
      JSON.stringify({
        ok: false,
        error: { code: "provider_unavailable" },
      }),
    );
    expect(body).not.toContain("Firestore");
  });
});
