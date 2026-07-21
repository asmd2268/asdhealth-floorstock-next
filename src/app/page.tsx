import { cookies } from "next/headers";

import { AppShell } from "@/components/app-shell";
import {
  baseBrand,
  demoAuthenticatedUser,
  demoFacilityScope,
  demoFeatureFlags,
} from "@/config/platform";
import { isDemoRoleSwitcherEnabled } from "@/config/public-environment";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";

export default async function Home() {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
  );

  return (
    <AppShell
      authenticatedUser={demoAuthenticatedUser}
      branding={baseBrand}
      enableDemoRoleSwitcher={isDemoRoleSwitcherEnabled()}
      featureFlags={demoFeatureFlags}
      initialLocale={initialLocale}
      targetScope={demoFacilityScope}
    />
  );
}
