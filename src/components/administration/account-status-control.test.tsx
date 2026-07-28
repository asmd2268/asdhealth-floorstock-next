// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountStatusControl } from "./account-status-control";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const labels = {
  activate: "Activate",
  deactivate: "Deactivate",
  confirmDeactivate: "Confirm deactivation",
  cancel: "Cancel",
  saving: "Saving",
  success: "Confirmed",
  error: "Failed",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe("account status control", () => {
  it("requires confirmation and does not optimistically report deactivation", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    render(
      <AccountStatusControl uid="user-1" status="active" labels={labels} />,
    );
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(
      screen.getByRole("group", { name: "Confirm deactivation" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    resolveRequest(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await screen.findByText("Confirmed");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("locks duplicate activation submissions immediately and announces failure", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccountStatusControl uid="user-1" status="disabled" labels={labels} />,
    );
    const button = screen.getByRole("button", { name: "Activate" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveRequest(new Response("{}", { status: 403 }));
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
