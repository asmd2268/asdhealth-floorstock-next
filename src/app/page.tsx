import { cookies } from "next/headers";

import { AuthenticationBoundary } from "@/components/authentication-boundary";
import { baseBrand, demoFeatureFlags } from "@/config/platform";
import { isDemoRoleSwitcherEnabled } from "@/config/public-environment";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { resolveInitialAuthenticationState } from "@/services/auth/bootstrap";
import { explicitDemoSessionService } from "@/services/auth/demo-session";
import { unconfiguredProductionSessionService } from "@/services/auth/unconfigured-production";

export default async function Home() {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );
  const demoEnabled = isDemoRoleSwitcherEnabled();
  const authenticationState = await resolveInitialAuthenticationState(
    demoEnabled,
    unconfiguredProductionSessionService,
    explicitDemoSessionService,
  );

  return (
    <AuthenticationBoundary
      authenticationState={authenticationState}
      branding={baseBrand}
      enableDemoRoleSwitcher={demoEnabled}
      featureFlags={demoFeatureFlags}
      initialLocale={initialLocale}
    />
  );
}
