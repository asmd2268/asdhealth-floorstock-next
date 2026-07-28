// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeatureForm } from "./feature-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const initial = {
  announcements: true,
  zebra_labels: false,
  new_request: false,
  controlled_medicines: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("feature administration form", () => {
  it("submits the rendered feature set as a stale-write precondition", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeatureForm
        initial={initial}
        labels={{
          names: {
            announcements: "Announcements",
            zebra_labels: "Zebra labels",
            new_request: "New request",
            controlled_medicines: "Controlled medicines",
            inventory: "Inventory",
          },
          enabled: "Enabled",
          submit: "Replace",
          saving: "Saving",
          success: "Confirmed",
          error: "Failed",
        }}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /New request/u }));
    await user.click(screen.getByRole("button", { name: "Replace" }));

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      featureFlags: { ...initial, new_request: true },
      expectedFeatureFlags: initial,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("advances the stale-write precondition after a successful replacement", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeatureForm
        initial={initial}
        labels={{
          names: {
            announcements: "Announcements",
            zebra_labels: "Zebra labels",
            new_request: "New request",
            controlled_medicines: "Controlled medicines",
            inventory: "Inventory",
          },
          enabled: "Enabled",
          submit: "Replace",
          saving: "Saving",
          success: "Confirmed",
          error: "Failed",
        }}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Announcements/u }));
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await user.click(screen.getByRole("checkbox", { name: /New request/u }));
    await user.click(screen.getByRole("button", { name: "Replace" }));

    const secondOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(secondOptions.body))).toEqual({
      expectedFeatureFlags: { ...initial, announcements: false },
      featureFlags: {
        ...initial,
        announcements: false,
        new_request: true,
      },
    });
  });
});
