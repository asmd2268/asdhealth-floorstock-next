import { describe, expect, it, vi } from "vitest";

import type { FloorStockRequestActorContext } from "@/domain/requests/types";

import {
  handleFloorStockRequestMutation,
  type FloorStockRequestHttpDependencies,
} from "./http";

const origin = "https://floorstock.example.test";
const context = { uid: "user-1" } as FloorStockRequestActorContext;

function request(body: string, overrides: Record<string, string> = {}) {
  return new Request(`${origin}/api/floor-stock-requests`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      "x-asdhealth-floor-stock-request-action": "create",
      "x-request-id": "correlation-1",
      cookie: "asdhealth_session=value",
      ...overrides,
    },
    body,
  });
}

function dependencies(): FloorStockRequestHttpDependencies {
  return {
    origin: () => origin,
    resolveContext: vi.fn().mockResolvedValue({ ok: true, value: context }),
    mutate: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        floorStockRequestId: "request-1",
        status: "draft",
        duplicate: false,
      },
    }),
  };
}

describe("floor-stock request HTTP boundary", () => {
  it("accepts a bounded operation-specific same-origin request", async () => {
    const deps = dependencies();
    const body =
      '{"lines":[{"configurationId":"configuration-1","quantity":2}]}';
    const response = await handleFloorStockRequestMutation(
      request(body),
      "create",
      null,
      deps,
    );
    expect(response.status).toBe(201);
    expect(deps.mutate).toHaveBeenCalledWith(
      context,
      "create",
      "correlation-1",
      null,
      { lines: [{ configurationId: "configuration-1", quantity: 2 }] },
    );
  });

  it.each([
    ["origin", "https://evil.example"],
    ["sec-fetch-site", "cross-site"],
    ["content-type", "text/plain"],
    ["x-asdhealth-floor-stock-request-action", "approve"],
  ])("rejects invalid %s before session resolution", async (header, value) => {
    const deps = dependencies();
    const response = await handleFloorStockRequestMutation(
      request("{}", { [header]: value }),
      "create",
      null,
      deps,
    );
    expect(response.status).toBe(403);
    expect(deps.resolveContext).not.toHaveBeenCalled();
  });

  it("rejects duplicate JSON keys, invalid target IDs, and length mismatch", async () => {
    const deps = dependencies();
    expect(
      (
        await handleFloorStockRequestMutation(
          request('{"note":"A","note":"B"}'),
          "create",
          null,
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleFloorStockRequestMutation(
          request("{}", {
            "x-asdhealth-floor-stock-request-action": "approve",
          }),
          "approve",
          "../other-tenant",
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleFloorStockRequestMutation(
          request("{}", { "content-length": "999" }),
          "create",
          null,
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it("normalizes missing targets without leaking record existence", async () => {
    const deps = dependencies();
    deps.mutate = vi.fn().mockResolvedValue({ ok: false, code: "not_found" });
    const response = await handleFloorStockRequestMutation(
      request("{}", {
        "x-asdhealth-floor-stock-request-action": "approve",
      }),
      "approve",
      "request-1",
      deps,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});
