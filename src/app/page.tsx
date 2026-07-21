import { cookies } from "next/headers";

import { DemoAppShell } from "@/components/app-shell";
import { AuthenticationBoundary } from "@/components/authentication-boundary";
import { baseBrand } from "@/config/platform";
import { isTrustedDemoModeEnabled } from "@/config/public-environment";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { resolveApplicationBootstrap } from "@/services/auth/bootstrap";
import { unconfiguredProductionSessionService } from "@/services/auth/unconfigured-production";

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
  const bootstrap = await resolveApplicationBootstrap(
    trustedDemoGate,
    unconfiguredProductionSessionService,
    loadExplicitDemoSessionService,
  );

  if (
    bootstrap.demoEnabled &&
    bootstrap.authenticationState.status === "authenticated"
  ) {
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
