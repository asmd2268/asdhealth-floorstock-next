// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseBrand, demoFacilityScope } from "@/config/platform";
import type { AuthenticatedUser } from "@/services/contracts/auth";

import { AppShell, type AppShellProps } from "./app-shell";

const authenticatedUser: AuthenticatedUser = {
  id: "user-1",
  email: null,
  displayName: null,
  role: "pharmacy_manager",
  scope: demoFacilityScope,
};

const defaultProps: AppShellProps = {
  authenticatedUser,
  branding: baseBrand,
  enableDemoRoleSwitcher: false,
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: true,
    controlled_medicines: false,
  },
  initialLocale: "en",
  targetScope: demoFacilityScope,
};

function mockMobileViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockMobileViewport(false);
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.body.style.overflow = "";
  document.cookie = "asdhealth-locale=; Max-Age=0; Path=/";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("application shell boundaries", () => {
  it("hides the demo role switcher by default", () => {
    render(<AppShell {...defaultProps} />);
    expect(screen.queryByLabelText("Demo role")).not.toBeInTheDocument();
  });

  it("shows the demo role switcher only when explicitly enabled", () => {
    render(<AppShell {...defaultProps} enableDemoRoleSwitcher />);
    expect(screen.getByLabelText("Demo role")).toBeInTheDocument();
  });

  it("uses authenticated identity when demo switching is disabled", () => {
    render(
      <AppShell
        {...defaultProps}
        authenticatedUser={{
          ...authenticatedUser,
          role: "external_pharmacy_supervisor",
        }}
      />,
    );
    expect(screen.queryByRole("navigation")).not.toHaveTextContent("Dashboard");
    expect(screen.queryByRole("navigation")).not.toHaveTextContent(
      "Announcements",
    );
  });

  it("propagates branding configuration and renders a safe custom logo", () => {
    render(
      <AppShell
        {...defaultProps}
        branding={{
          ...baseBrand,
          productName: "Client Floor Stock",
          clientDisplayName: "Client Health",
          ownerText: "Owned by Client",
          logoUrl: "https://assets.example.com/logo.svg",
          primaryAccentToken: "#123456",
        }}
      />,
    );

    expect(screen.getByText("Client Floor Stock")).toBeInTheDocument();
    expect(screen.getByText("Client Health")).toBeInTheDocument();
    expect(screen.getAllByText("Owned by Client")).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "Client Floor Stock" }),
    ).toHaveAttribute("src", "https://assets.example.com/logo.svg");
  });

  it("restores Arabic initially and persists subsequent language changes", async () => {
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} initialLocale="ar" />);

    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");

    await user.selectOptions(screen.getByLabelText("اللغة"), "en");
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.cookie).toContain("asdhealth-locale=en");
  });

  it("makes the closed mobile drawer inert and manages focus and Escape", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    const sidebar = document.getElementById("application-sidebar");
    expect(menuButton).toHaveAttribute("aria-controls", "application-sidebar");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    expect(sidebar).toHaveAttribute("inert");

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(sidebar).toHaveAttribute("aria-hidden", "false");
    expect(sidebar).not.toHaveAttribute("inert");
    expect(
      within(sidebar as HTMLElement).getByRole("button", {
        name: "Close navigation",
      }),
    ).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("renders module sections at their canonical navigation targets", () => {
    render(<AppShell {...defaultProps} />);
    expect(document.getElementById("announcements")).toBeInTheDocument();
    expect(document.getElementById("zebra-labels")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zebra labels" })).toHaveAttribute(
      "href",
      "#zebra-labels",
    );
  });
});
