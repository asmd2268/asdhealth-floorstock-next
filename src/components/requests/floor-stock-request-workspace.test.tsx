// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dictionaries } from "@/i18n/dictionaries";

import { FloorStockRequestWorkspace } from "./floor-stock-request-workspace";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const configuration = {
  configurationId: "configuration-1",
  itemId: "item-1",
  itemCode: "ITEM-1",
  genericName: "Medicine",
  strength: "10 mg",
  locationId: "location-1",
  locationName: "Ward stock",
  unit: "tablet" as const,
  maximumQuantity: 30,
};

describe("floor-stock request workspace", () => {
  it("creates only configuration and operation fields without trusted scope", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "correlation-1" });
    const labels = dictionaries.en.requests;
    render(
      <FloorStockRequestWorkspace
        configurations={[configuration]}
        labels={labels}
        mayApprove={false}
        mayCreate
        mayManage={false}
        requests={[]}
      />,
    );
    await user.click(screen.getByRole("checkbox"));
    const quantity = screen.getByRole("spinbutton");
    await user.clear(quantity);
    await user.type(quantity, "12");
    await user.type(screen.getByLabelText(labels.note), "Ward request");
    await user.click(screen.getByRole("button", { name: labels.create }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/floor-stock-requests");
    expect(options.headers).toMatchObject({
      "x-asdhealth-floor-stock-request-action": "create",
      "x-request-id": "correlation-1",
    });
    const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      note: "Ward request",
      lines: [{ configurationId: "configuration-1", quantity: 12 }],
    });
    expect(payload).not.toHaveProperty("tenantId");
    expect(payload).not.toHaveProperty("facilityId");
    expect(payload).not.toHaveProperty("departmentId");
    expect(payload).not.toHaveProperty("actorUid");
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("shows only lifecycle actions allowed by status and trusted UI capability", () => {
    const labels = dictionaries.en.requests;
    render(
      <FloorStockRequestWorkspace
        configurations={[]}
        labels={labels}
        mayApprove
        mayCreate={false}
        mayManage
        requests={[
          {
            floorStockRequestId: "request-1",
            departmentId: "department-1",
            status: "submitted",
            requestedByUid: "department-user",
            lineCount: 1,
            createdAt: "2028-01-01T00:00:00.000Z",
            updatedAt: "2028-01-01T00:00:00.000Z",
            maySubmit: false,
            mayCancel: false,
          },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: labels.approve })).toBeVisible();
    expect(screen.getByRole("button", { name: labels.reject })).toBeVisible();
    expect(screen.queryByRole("button", { name: labels.submit })).toBeNull();
    expect(screen.queryByRole("button", { name: labels.cancel })).toBeNull();
  });
});
