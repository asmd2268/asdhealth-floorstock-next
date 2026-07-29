// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dictionaries } from "@/i18n/dictionaries";

import { InventoryProvisioningForms } from "./inventory-provisioning-forms";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("inventory provisioning forms", () => {
  it("submits only operation fields and never trusted scope", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    const labels = dictionaries.en.inventory.provisioning;
    render(
      <InventoryProvisioningForms
        operations={["upsert_item"]}
        labels={labels}
      />,
    );

    await user.click(screen.getByText(labels.item));
    await user.type(screen.getByLabelText(labels.identifier), "item-1");
    await user.type(screen.getByLabelText(labels.itemCode), "ITEM-1");
    await user.type(screen.getByLabelText(labels.genericName), "Medicine");
    await user.type(screen.getByLabelText(labels.dosageForm), "Tablet");
    await user.type(screen.getByLabelText(labels.strength), "10 mg");
    await user.click(screen.getByRole("button", { name: labels.save }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/inventory/catalog/items/item-1");
    expect(options.headers).toMatchObject({
      "x-asdhealth-inventory-provisioning-action": "upsert_item",
      "x-request-id": "request-1",
    });
    const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      itemCode: "ITEM-1",
      genericName: "Medicine",
      dosageForm: "Tablet",
      strength: "10 mg",
      baseUnit: "each",
      dispensingUnit: "each",
    });
    expect(payload).not.toHaveProperty("tenantId");
    expect(payload).not.toHaveProperty("facilityId");
    expect(payload).not.toHaveProperty("actorUid");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
