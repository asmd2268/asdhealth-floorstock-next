import { describe, expect, it, vi } from "vitest";

import type { InventoryActorContext } from "@/domain/inventory/types";

import {
  handleInventoryMutation,
  type InventoryHttpDependencies,
} from "./http";

const origin = "https://floorstock.example.test";
const context = { uid: "user-1" } as InventoryActorContext;

function request(body: string, overrides: Record<string, string> = {}) {
  return new Request(`${origin}/api/inventory/receive`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      "x-asdhealth-inventory-action": "receive",
      "x-request-id": "request-1",
      cookie: "asdhealth_session=value",
      ...overrides,
    },
    body,
  });
}

function dependencies(): InventoryHttpDependencies {
  return {
    origin: () => origin,
    resolveContext: vi.fn().mockResolvedValue({ ok: true, value: context }),
    post: vi.fn().mockResolvedValue({
      ok: true,
      value: { transactionId: "transaction-1", duplicate: false },
    }),
  };
}

describe("inventory mutation HTTP boundary", () => {
  it("accepts a bounded same-origin operation-specific request", async () => {
    const deps = dependencies();
    const response = await handleInventoryMutation(
      request('{"destinationLocationId":"pharmacy","lines":[]}'),
      "receive",
      deps,
    );
    expect(response.status).toBe(201);
    expect(deps.post).toHaveBeenCalledWith(
      context,
      "receive",
      "request-1",
      expect.objectContaining({ destinationLocationId: "pharmacy" }),
    );
  });

  it.each([
    ["origin", "https://evil.example"],
    ["sec-fetch-site", "cross-site"],
    ["x-asdhealth-inventory-action", "transfer"],
    ["content-type", "text/plain"],
  ])(
    "rejects an invalid %s before session resolution",
    async (header, value) => {
      const deps = dependencies();
      const response = await handleInventoryMutation(
        request("{}", { [header]: value }),
        "receive",
        deps,
      );
      expect(response.status).toBe(403);
      expect(deps.resolveContext).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate JSON keys and length mismatch", async () => {
    const deps = dependencies();
    expect(
      (
        await handleInventoryMutation(
          request('{"lines":[],"lines":[]}'),
          "receive",
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleInventoryMutation(
          request("{}", { "content-length": "999" }),
          "receive",
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("normalizes not-found and provider failures without raw details", async () => {
    const deps = dependencies();
    deps.post = vi.fn().mockResolvedValue({ ok: false, code: "not_found" });
    const response = await handleInventoryMutation(
      request("{}"),
      "receive",
      deps,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});
