// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseBrand } from "@/config/platform";

import {
  AuthenticationBoundary,
  type AuthenticationBoundaryProps,
} from "./authentication-boundary";

const defaultProps: AuthenticationBoundaryProps = {
  authenticationState: { status: "loading" },
  branding: baseBrand,
  featureFlags: {},
  initialLocale: "en",
};

beforeEach(() => {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.cookie = "asdhealth-locale=; Max-Age=0; Path=/";
});

afterEach(cleanup);

describe("authentication boundary", () => {
  it("renders the loading state", () => {
    render(<AuthenticationBoundary {...defaultProps} />);
    expect(
      screen.getByRole("heading", { name: "Preparing your secure workspace" }),
    ).toBeInTheDocument();
  });

  it("renders a disabled sign-in placeholder for signed-out users", () => {
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sign in to continue" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("distinguishes access denial from provider failure", () => {
    const { rerender } = render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{
          status: "error",
          failure: { category: "access_denied", reason: "tenant_mismatch" },
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Access denied" }),
    ).toBeInTheDocument();

    rerender(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{
          status: "error",
          failure: {
            category: "provider_error",
            reason: "provider_unavailable",
          },
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Authentication unavailable" }),
    ).toBeInTheDocument();
  });

  it("allows a denied Firebase identity to sign out safely", async () => {
    const user = userEvent.setup();
    const signOut = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "provider_unavailable" });
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{
          status: "error",
          failure: { category: "access_denied", reason: "profile_not_found" },
        }}
        signOut={signOut}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-out failed. Please try again.",
    );
  });

  it("renders Arabic auth states RTL and persists an English switch", async () => {
    const user = userEvent.setup();
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        initialLocale="ar"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "سجّل الدخول للمتابعة" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");

    await user.selectOptions(screen.getByLabelText("اللغة"), "en");
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.cookie).toContain("asdhealth-locale=en");
  });

  it("propagates configured brand identity on signed-out screens", () => {
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        branding={{
          ...baseBrand,
          productName: "Regional Floor Stock",
          clientDisplayName: "Regional Health",
          ownerText: "Owned by Regional Health",
        }}
      />,
    );

    expect(screen.getByText("Regional Floor Stock")).toBeInTheDocument();
    expect(screen.getByText("Regional Health")).toBeInTheDocument();
    expect(screen.getByText("Owned by Regional Health")).toBeInTheDocument();
  });

  it("validates email and required password before sign-in", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn();
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        signIn={signIn}
      />,
    );

    await user.type(screen.getByLabelText("Email address"), "invalid-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("submits credentials and renders only normalized authentication errors", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue({
      ok: false,
      reason: "invalid_credentials",
    });
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        signIn={signIn}
      />,
    );

    await user.type(screen.getByLabelText("Email address"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
    expect(
      await screen.findByText("Email or password is incorrect."),
    ).toHaveAttribute("role", "alert");
    expect(document.body).not.toHaveTextContent("Firebase");
  });

  it("renders localized Arabic validation and provider errors", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue({
      ok: false,
      reason: "provider_unavailable",
    });
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        initialLocale="ar"
        signIn={signIn}
      />,
    );

    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(
      screen.getByText("أدخل بريدًا إلكترونيًا صالحًا."),
    ).toBeInTheDocument();
    expect(screen.getByText("أدخل كلمة المرور.")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("البريد الإلكتروني"),
      "user@example.com",
    );
    await user.type(screen.getByLabelText("كلمة المرور"), "secret");
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تسجيل الدخول غير متاح. يرجى المحاولة لاحقًا.",
    );
  });

  it("disables the form and shows a submitting state", async () => {
    const user = userEvent.setup();
    let finish:
      | ((value: { ok: false; reason: "provider_unavailable" }) => void)
      | undefined;
    const signIn = vi.fn(
      () =>
        new Promise<{ ok: false; reason: "provider_unavailable" }>(
          (resolve) => {
            finish = resolve;
          },
        ),
    );
    render(
      <AuthenticationBoundary
        {...defaultProps}
        authenticationState={{ status: "unauthenticated" }}
        signIn={signIn}
      />,
    );

    await user.type(screen.getByLabelText("Email address"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.getByLabelText("Email address")).toBeDisabled();

    finish?.({ ok: false, reason: "provider_unavailable" });
    expect(
      await screen.findByText(
        "Sign-in is unavailable. Please try again later.",
      ),
    ).toBeInTheDocument();
  });
});
