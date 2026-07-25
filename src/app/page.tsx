import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthenticationBoundary } from "@/components/authentication-boundary";
import { FirebaseAuthenticationBoundary } from "@/components/firebase-authentication-boundary";
import { baseBrand } from "@/config/platform";
import { isTrustedDemoModeEnabled } from "@/config/public-environment";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { resolveApplicationBootstrap } from "@/services/auth/bootstrap";
import { unconfiguredProductionSessionService } from "@/services/auth/unconfigured-production";
import { getServerSessionService } from "@/server/session/composition";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionCookieName } from "@/server/session/types";

async function loadExplicitDemoSessionService() {
  const { explicitDemoSessionService } =
    await import("@/services/auth/demo-session");
  return explicitDemoSessionService;
}

export default async function Home() {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );
  const trustedDemoGate = isTrustedDemoModeEnabled();
  if (!trustedDemoGate) {
    const requestHeaders = await headers();
    const sessionCookie = readUniqueSessionCookie(
      requestHeaders.get("cookie"),
      getServerSessionCookieName(process.env.NODE_ENV === "production"),
    );
    if (sessionCookie.ok && sessionCookie.value) {
      let sessionIsValid = false;
      try {
        const session = await getServerSessionService().authorize(
          sessionCookie.value,
          { resource: "dashboard", action: "read" },
        );
        sessionIsValid = session.ok;
      } catch {
        // Missing server configuration or provider outages stay fail-closed on
        // the public authentication boundary without exposing the cause.
      }
      if (sessionIsValid) redirect("/app");
    }
    return (
      <FirebaseAuthenticationBoundary
        branding={baseBrand}
        initialLocale={initialLocale}
      />
    );
  }

  const bootstrap = await resolveApplicationBootstrap(
    true,
    unconfiguredProductionSessionService,
    loadExplicitDemoSessionService,
  );

  if (
    bootstrap.demoEnabled &&
    bootstrap.authenticationState.status === "authenticated"
  ) {
    const { DemoAppShell } = await import("@/components/demo-app-shell");
    return (
      <DemoAppShell
        authenticatedUser={bootstrap.authenticationState.user}
        branding={baseBrand}
        featureFlags={bootstrap.featureFlags}
        initialLocale={initialLocale}
      />
    );
  }

  return (
    <AuthenticationBoundary
      authenticationState={bootstrap.authenticationState}
      branding={baseBrand}
      featureFlags={bootstrap.featureFlags}
      initialLocale={initialLocale}
    />
  );
}
