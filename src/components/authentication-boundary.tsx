"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { getSafeLogoUrl } from "@/config/platform";
import type { AuthenticationState } from "@/domain/auth/types";
import type {
  BrandingConfiguration,
  FeatureFlagSet,
} from "@/domain/platform/types";
import { getDictionary, getDirection, type Locale } from "@/i18n/dictionaries";
import { serializeLocaleCookie } from "@/i18n/locale";

import { AppShell } from "./app-shell";
import { GlobeIcon, HeartPulseIcon, ShieldIcon } from "./icons";

export interface AuthenticationBoundaryProps {
  authenticationState: AuthenticationState;
  branding: BrandingConfiguration;
  featureFlags: FeatureFlagSet;
  initialLocale: Locale;
}

export function AuthenticationBoundary({
  authenticationState,
  branding,
  featureFlags,
  initialLocale,
}: AuthenticationBoundaryProps) {
  const [locale, setLocale] = useState(initialLocale);
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
          <form className="auth-form">
            <label>
              <span>{dictionary.auth.emailLabel}</span>
              <input
                autoComplete="email"
                disabled
                placeholder={dictionary.auth.emailPlaceholder}
                type="email"
              />
            </label>
            <label>
              <span>{dictionary.auth.passwordLabel}</span>
              <input
                autoComplete="current-password"
                disabled
                placeholder={dictionary.auth.passwordPlaceholder}
                type="password"
              />
            </label>
            <button disabled type="button">
              {dictionary.auth.signIn}
            </button>
            <small>{dictionary.auth.signInUnavailable}</small>
          </form>
        ) : null}
      </section>

      <footer className="auth-footer">{branding.ownerText}</footer>
    </main>
  );
}
