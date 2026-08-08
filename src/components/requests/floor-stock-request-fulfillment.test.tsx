// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dictionaries } from "@/i18n/dictionaries";

import { FloorStockRequestFulfillment } from "./floor-stock-request-fulfillment";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("floor-stock request fulfillment", () => {
  it("submits exact split-lot allocations without trusted scope fields", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "fulfillment-correlation" });
    const labels = dictionaries.en.requests;
    render(
      <FloorStockRequestFulfillment
        detail={{
          floorStockRequestId: "request-1",
          lines: [
            {
              requestLineId: "request-line-1",
              itemCode: "ITEM-1",
              genericName: "Medicine",
              strength: "10 mg",
              destinationLocationName: "Ward stock",
              unit: "tablet",
              approvedQuantity: 8,
              options: [
                {
                  balanceId: "balance-1",
                  sourceLocationId: "pharmacy-1",
                  sourceLocationName: "Main pharmacy",
                  lotNumber: "LOT-1",
                  expiryDate: "2030-01-01",
                  availableQuantity: 3,
                },
                {
                  balanceId: "balance-2",
                  sourceLocationId: "pharmacy-1",
                  sourceLocationName: "Main pharmacy",
                  lotNumber: "LOT-2",
                  expiryDate: "2030-02-01",
                  availableQuantity: 10,
                },
              ],
            },
          ],
        }}
        labels={labels}
      />,
    );
    const quantities = screen.getAllByRole("spinbutton");
    await user.clear(quantities[0]!);
    await user.type(quantities[0]!, "3");
    await user.clear(quantities[1]!);
    await user.type(quantities[1]!, "5");
    await user.click(
      screen.getByRole("button", { name: labels.completeFulfillment }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "/api/floor-stock-requests/request-1/complete-fulfillment",
    );
    expect(options.headers).toMatchObject({
      "x-asdhealth-floor-stock-request-action": "complete_fulfillment",
      "x-request-id": "fulfillment-correlation",
    });
    const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      sourceLocationId: "pharmacy-1",
      lines: [
        {
          requestLineId: "request-line-1",
          allocations: [
            { balanceId: "balance-1", quantity: 3 },
            { balanceId: "balance-2", quantity: 5 },
          ],
        },
      ],
    });
    expect(payload).not.toHaveProperty("tenantId");
    expect(payload).not.toHaveProperty("facilityId");
    expect(payload).not.toHaveProperty("departmentId");
    expect(payload).not.toHaveProperty("actorUid");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/requests"));
  });
});
