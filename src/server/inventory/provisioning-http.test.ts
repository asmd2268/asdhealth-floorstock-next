import { describe, expect, it, vi } from "vitest";

import type { InventoryProvisioningActorContext } from "@/domain/inventory/provisioning-types";

import {
  handleInventoryProvisioningMutation,
  type InventoryProvisioningHttpDependencies,
} from "./provisioning-http";

const origin = "https://floorstock.example.test";
const context = { uid: "user-1" } as InventoryProvisioningActorContext;

function request(body: string, overrides: Record<string, string> = {}) {
  return new Request(`${origin}/api/inventory/catalog/items/item-1`, {
    method: "PUT",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      "x-asdhealth-inventory-provisioning-action": "upsert_item",
      "x-request-id": "request-1",
      cookie: "asdhealth_session=value",
      ...overrides,
    },
    body,
  });
}

function dependencies(): InventoryProvisioningHttpDependencies {
  return {
    origin: () => origin,
    resolveContext: vi.fn().mockResolvedValue({ ok: true, value: context }),
    upsert: vi.fn().mockResolvedValue({
      ok: true,
      value: { targetId: "item-1", duplicate: false },
    }),
  };
}

describe("inventory provisioning HTTP boundary", () => {
  it("accepts a bounded operation-specific same-origin request", async () => {
    const deps = dependencies();
    const response = await handleInventoryProvisioningMutation(
      request('{"itemCode":"ITEM-1"}'),
      "upsert_item",
      "item-1",
      deps,
    );
    expect(response.status).toBe(201);
    expect(deps.upsert).toHaveBeenCalledWith(
      context,
      "upsert_item",
      "item-1",
      "request-1",
      { itemCode: "ITEM-1" },
    );
  });

  it.each([
    ["origin", "https://evil.example"],
    ["sec-fetch-site", "cross-site"],
    ["content-type", "text/plain"],
    ["x-asdhealth-inventory-provisioning-action", "upsert_location"],
  ])(
    "rejects invalid %s before resolving the session",
    async (header, value) => {
      const deps = dependencies();
      const response = await handleInventoryProvisioningMutation(
        request("{}", { [header]: value }),
        "upsert_item",
        "item-1",
        deps,
      );
      expect(response.status).toBe(403);
      expect(deps.resolveContext).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid target IDs, duplicate keys, and length mismatch", async () => {
    const deps = dependencies();
    expect(
      (
        await handleInventoryProvisioningMutation(
          request("{}"),
          "upsert_item",
          "../item",
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleInventoryProvisioningMutation(
          request('{"itemCode":"A","itemCode":"B"}'),
          "upsert_item",
          "item-1",
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleInventoryProvisioningMutation(
          request("{}", { "content-length": "999" }),
          "upsert_item",
          "item-1",
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("normalizes not-found and provider failures", async () => {
    const deps = dependencies();
    deps.upsert = vi.fn().mockResolvedValue({ ok: false, code: "not_found" });
    const response = await handleInventoryProvisioningMutation(
      request("{}"),
      "upsert_item",
      "item-1",
      deps,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});
