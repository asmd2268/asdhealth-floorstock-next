// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FacilitySwitcher } from "./facility-switcher";

const facilities = [
  { id: "facility-1", displayName: "Central Hospital" },
  { id: "facility-2", displayName: "North Hospital" },
] as const;

afterEach(cleanup);

describe("production facility switcher", () => {
  it("is hidden when only one currently valid facility is available", () => {
    render(
      <FacilitySwitcher
        activeFacilityId="facility-1"
        facilities={facilities.slice(0, 1)}
        locale="en"
        refreshApplication={vi.fn()}
        switchFacility={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Facility")).not.toBeInTheDocument();
  });

  it("submits the selected canonical ID once and refreshes only after confirmation", async () => {
    const user = userEvent.setup();
    let resolveSwitch!: (value: { ok: true }) => void;
    const switchFacility = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveSwitch = resolve;
        }),
    );
    const refreshApplication = vi.fn();
    render(
      <FacilitySwitcher
        activeFacilityId="facility-1"
        facilities={facilities}
        locale="en"
        refreshApplication={refreshApplication}
        switchFacility={switchFacility}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Facility"), "facility-2");
    await user.click(screen.getByRole("button", { name: "Switch" }));
    expect(switchFacility).toHaveBeenCalledOnce();
    expect(switchFacility).toHaveBeenCalledWith("facility-2");
    expect(refreshApplication).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Switching…" })).toBeDisabled();

    resolveSwitch({ ok: true });
    await vi.waitFor(() => expect(refreshApplication).toHaveBeenCalledOnce());
  });

  it("keeps the active facility and announces a localized failure", async () => {
    const user = userEvent.setup();
    render(
      <FacilitySwitcher
        activeFacilityId="facility-1"
        facilities={facilities}
        locale="ar"
        refreshApplication={vi.fn()}
        switchFacility={vi.fn().mockResolvedValue({
          ok: false,
          reason: "access_denied",
        })}
      />,
    );

    await user.selectOptions(screen.getByLabelText("المنشأة"), "facility-2");
    await user.click(screen.getByRole("button", { name: "تبديل" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر تأكيد تغيير المنشأة",
    );
    expect(screen.getByLabelText("المنشأة")).toHaveValue("facility-1");
  });

  it("locks immediately against rapid duplicate submissions", () => {
    const switchFacility = vi.fn(
      () => new Promise<{ ok: true }>(() => undefined),
    );
    render(
      <FacilitySwitcher
        activeFacilityId="facility-1"
        facilities={facilities}
        locale="en"
        refreshApplication={vi.fn()}
        switchFacility={switchFacility}
      />,
    );
    const form = screen.getByRole("button", { name: "Switch" }).closest("form");
    if (!form) throw new Error("Expected facility switch form.");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(switchFacility).toHaveBeenCalledOnce();
  });

  it("reports a stalled request without unlocking a duplicate rotation", async () => {
    vi.useFakeTimers();
    try {
      const switchFacility = vi.fn(
        () => new Promise<{ ok: true }>(() => undefined),
      );
      render(
        <FacilitySwitcher
          activeFacilityId="facility-1"
          facilities={facilities}
          locale="en"
          refreshApplication={vi.fn()}
          switchFacility={switchFacility}
        />,
      );
      const form = screen
        .getByRole("button", { name: "Switch" })
        .closest("form");
      if (!form) throw new Error("Expected facility switch form.");
      fireEvent.submit(form);
      await act(() => vi.advanceTimersByTimeAsync(15_000));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The change could not be confirmed",
      );
      expect(screen.getByLabelText("Facility")).toHaveValue("facility-1");
      expect(screen.getByRole("button", { name: "Switching…" })).toBeDisabled();
      fireEvent.submit(form);
      expect(switchFacility).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late response after the component unmounts", async () => {
    let resolveSwitch!: (result: { ok: true }) => void;
    const refreshApplication = vi.fn();
    const rendered = render(
      <FacilitySwitcher
        activeFacilityId="facility-1"
        facilities={facilities}
        locale="en"
        refreshApplication={refreshApplication}
        switchFacility={vi.fn(
          () =>
            new Promise<{ ok: true }>((resolve) => {
              resolveSwitch = resolve;
            }),
        )}
      />,
    );
    const form = screen.getByRole("button", { name: "Switch" }).closest("form");
    if (!form) throw new Error("Expected facility switch form.");
    fireEvent.submit(form);
    rendered.unmount();
    resolveSwitch({ ok: true });
    await Promise.resolve();
    expect(refreshApplication).not.toHaveBeenCalled();
  });
});
