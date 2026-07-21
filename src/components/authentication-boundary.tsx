"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

import { getSafeLogoUrl } from "@/config/platform";
import type { AuthenticationState } from "@/domain/auth/types";
import type {
  BrandingConfiguration,
  FeatureFlagSet,
} from "@/domain/platform/types";
import { getDictionary, getDirection, type Locale } from "@/i18n/dictionaries";
import { serializeLocaleCookie } from "@/i18n/locale";
import type { SignInService, SignOutService } from "@/services/contracts/auth";

import { AppShell } from "./app-shell";
import { GlobeIcon, HeartPulseIcon, ShieldIcon } from "./icons";

export interface AuthenticationBoundaryProps {
  authenticationState: AuthenticationState;
  branding: BrandingConfiguration;
  featureFlags: FeatureFlagSet;
  initialLocale: Locale;
  signIn?: SignInService["signIn"];
  signOut?: SignOutService["signOut"];
}

type SignInError = "invalidCredentials" | "tooManyAttempts" | "signInError";

export function AuthenticationBoundary({
  authenticationState,
  branding,
  featureFlags,
  initialLocale,
  signIn,
  signOut,
}: AuthenticationBoundaryProps) {
  const [locale, setLocale] = useState(initialLocale);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [signInError, setSignInError] = useState<SignInError | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [renderedAuthenticationStatus, setRenderedAuthenticationStatus] =
    useState(authenticationState.status);

  if (renderedAuthenticationStatus !== authenticationState.status) {
    setRenderedAuthenticationStatus(authenticationState.status);
    setSubmitting(false);
    setSignInError(null);
    setSigningOut(false);
    setSignOutFailed(false);
  }
  const dictionary = getDictionary(locale);
  const direction = getDirection(locale);
  const safeLogoUrl = getSafeLogoUrl(branding.logoUrl);
  const shellStyle = {
    "--accent": branding.primaryAccentToken,
  } as CSSProperties;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [direction, locale]);

  const submitSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || submitting) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const invalidEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const missingPassword = password.length === 0;
    setEmailError(invalidEmail);
    setPasswordError(missingPassword);
    setSignInError(null);
    if (invalidEmail || missingPassword) return;

    setSubmitting(true);
    const result = await signIn({ email, password });
    if (!result.ok) {
      setSubmitting(false);
      setSignInError(
        result.reason === "invalid_credentials"
          ? "invalidCredentials"
          : result.reason === "too_many_attempts"
            ? "tooManyAttempts"
            : "signInError",
      );
    }
  };

  const submitSignOut = async () => {
    if (!signOut || signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    const result = await signOut();
    if (!result.ok) {
      setSigningOut(false);
      setSignOutFailed(true);
    }
  };

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    document.cookie = serializeLocaleCookie(
      nextLocale,
      window.location.protocol === "https:",
    );
  };

  if (authenticationState.status === "authenticated") {
    return (
      <AppShell
        authenticatedUser={authenticationState.user}
        branding={branding}
        featureFlags={featureFlags}
        initialLocale={locale}
        signOut={signOut}
      />
    );
  }

  const isLoading = authenticationState.status === "loading";
  const isSignedOut = authenticationState.status === "unauthenticated";
  const isAccessDenied =
    authenticationState.status === "error" &&
    authenticationState.failure.category === "access_denied";
  const title = isLoading
    ? dictionary.auth.loadingTitle
    : isSignedOut
      ? dictionary.auth.signedOutTitle
      : isAccessDenied
        ? dictionary.auth.accessDeniedTitle
        : dictionary.auth.errorTitle;
  const description = isLoading
    ? dictionary.auth.loadingDescription
    : isSignedOut
      ? dictionary.auth.signedOutDescription
      : isAccessDenied
        ? dictionary.auth.accessDeniedDescription
        : dictionary.auth.errorDescription;

  return (
    <main className="auth-page" dir={direction} style={shellStyle}>
      <div className="auth-language-control">
        <GlobeIcon width={17} height={17} />
        <label>
          <span className="visually-hidden">{dictionary.shell.language}</span>
          <select
            aria-label={dictionary.shell.language}
            value={locale}
            onChange={(event) => changeLocale(event.target.value as Locale)}
          >
            <option value="en">{dictionary.languages.en}</option>
            <option value="ar">{dictionary.languages.ar}</option>
          </select>
        </label>
      </div>

      <section
        aria-live={isLoading ? "polite" : undefined}
        className="auth-card"
      >
        <div className="auth-brand">
          <span className="brand-mark">
            {safeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={branding.productName}
                className="brand-logo-image"
                src={safeLogoUrl}
              />
            ) : (
              <HeartPulseIcon width={28} height={28} />
            )}
          </span>
          <div>
            <strong>{branding.productName}</strong>
            <small>{branding.clientDisplayName}</small>
          </div>
        </div>

        <div className={`auth-state-icon ${isLoading ? "is-loading" : ""}`}>
          {isLoading ? <span className="auth-spinner" /> : <ShieldIcon />}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>

        {isSignedOut ? (
          <form className="auth-form" noValidate onSubmit={submitSignIn}>
            <label>
              <span>{dictionary.auth.emailLabel}</span>
              <input
                aria-describedby={emailError ? "email-error" : undefined}
                aria-invalid={emailError}
                autoComplete="email"
                disabled={submitting || !signIn}
                name="email"
                placeholder={dictionary.auth.emailPlaceholder}
                type="email"
              />
            </label>
            {emailError ? (
              <small className="auth-field-error" id="email-error">
                {dictionary.auth.emailInvalid}
              </small>
            ) : null}
            <label>
              <span>{dictionary.auth.passwordLabel}</span>
              <input
                aria-describedby={passwordError ? "password-error" : undefined}
                aria-invalid={passwordError}
                autoComplete="current-password"
                disabled={submitting || !signIn}
                name="password"
                placeholder={dictionary.auth.passwordPlaceholder}
                type="password"
              />
            </label>
            {passwordError ? (
              <small className="auth-field-error" id="password-error">
                {dictionary.auth.passwordRequired}
              </small>
            ) : null}
            {signInError ? (
              <small className="auth-form-error" role="alert">
                {dictionary.auth[signInError]}
              </small>
            ) : null}
            <button disabled={submitting || !signIn} type="submit">
              {submitting ? dictionary.auth.signingIn : dictionary.auth.signIn}
            </button>
            {!signIn ? (
              <small>{dictionary.auth.signInUnavailable}</small>
            ) : null}
          </form>
        ) : null}

        {isAccessDenied && signOut ? (
          <button
            className="auth-secondary-action"
            disabled={signingOut}
            onClick={() => void submitSignOut()}
            type="button"
          >
            {signingOut ? dictionary.auth.signingOut : dictionary.auth.signOut}
          </button>
        ) : null}
        {signOutFailed ? (
          <small className="auth-form-error" role="alert">
            {dictionary.auth.signOutError}
          </small>
        ) : null}
      </section>

      <footer className="auth-footer">{branding.ownerText}</footer>
    </main>
  );
}
