// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseBrand, demoFacilityScope } from "@/config/platform";
import { resolveTrustedDemoGate } from "@/config/public-environment";
import type { AuthenticatedUser } from "@/domain/auth/types";

import { AppShell, DemoAppShell, type AppShellProps } from "./app-shell";

const authenticatedUser: AuthenticatedUser = {
  uid: "user-1",
  email: null,
  displayName: null,
  tenantId: "demo-tenant",
  platformId: demoFacilityScope.platformId,
  organizationId: demoFacilityScope.organizationId,
  facilityIds: [demoFacilityScope.facilityId],
  activeFacilityId: demoFacilityScope.facilityId,
  activeScope: demoFacilityScope,
  roleAssignments: [{ role: "pharmacy_manager", scope: demoFacilityScope }],
  explicitPermissionOverrides: [],
  accountStatus: "active",
};

const defaultProps: AppShellProps = {
  authenticatedUser,
  branding: baseBrand,
  featureFlags: {
    announcements: true,
    zebra_labels: true,
    new_request: true,
    controlled_medicines: false,
  },
  initialLocale: "en",
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
    expect(screen.getByText("Authenticated session")).toBeInTheDocument();
    expect(screen.queryByText("Foundation demo")).not.toBeInTheDocument();
  });

  it("shows the demo role switcher only when explicitly enabled", () => {
    render(<DemoAppShell {...defaultProps} />);
    expect(screen.getByLabelText("Demo role")).toBeInTheDocument();
  });

  it("cannot enable role substitution through an untrusted AppShell prop", () => {
    const untrustedProps = {
      ...defaultProps,
      enableDemoRoleSwitcher: true,
    };
    render(<AppShell {...untrustedProps} />);
    expect(screen.queryByLabelText("Demo role")).not.toBeInTheDocument();
    expect(screen.queryByText("Foundation demo")).not.toBeInTheDocument();
  });

  it("keeps production role switching disabled when the public flag is true", () => {
    const trustedGate = resolveTrustedDemoGate("production", "true");
    render(
      trustedGate ? (
        <DemoAppShell {...defaultProps} />
      ) : (
        <AppShell {...defaultProps} />
      ),
    );

    expect(trustedGate).toBe(false);
    expect(screen.queryByLabelText("Demo role")).not.toBeInTheDocument();
  });

  it("uses authenticated identity when demo switching is disabled", () => {
    render(
      <AppShell
        {...defaultProps}
        authenticatedUser={{
          ...authenticatedUser,
          roleAssignments: [
            {
              role: "external_pharmacy_supervisor",
              scope: demoFacilityScope,
            },
          ],
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

  it("invokes sign-out and renders a safe localized failure", async () => {
    const user = userEvent.setup();
    const signOut = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "provider_unavailable" });
    render(<AppShell {...defaultProps} signOut={signOut} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-out failed. Please try again.",
    );
  });
});
