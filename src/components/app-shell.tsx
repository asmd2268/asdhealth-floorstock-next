"use client";

import type { AuthenticatedUser } from "@/domain/auth/types";
import type {
  BrandingConfiguration,
  FeatureFlagSet,
} from "@/domain/platform/types";
import { getDictionary, type Locale } from "@/i18n/dictionaries";
import { getVisibleNavigation } from "@/navigation/navigation";
import type { SignOutService } from "@/services/contracts/auth";

import { PresentationalShell } from "./presentational-shell";
import { useShellLocale } from "./use-shell-locale";

export interface AppShellProps {
  authenticatedUser: AuthenticatedUser;
  branding: BrandingConfiguration;
  featureFlags: FeatureFlagSet;
  initialLocale: Locale;
  signOut?: SignOutService["signOut"];
}

export function AppShell({
  authenticatedUser,
  branding,
  featureFlags,
  initialLocale,
  signOut,
}: AppShellProps) {
  const { locale, changeLocale } = useShellLocale(initialLocale);
  const dictionary = getDictionary(locale);
  const navigation = getVisibleNavigation({
    roleAssignments: authenticatedUser.roleAssignments,
    subjectScope: authenticatedUser.activeScope,
    targetScope: authenticatedUser.activeScope,
    featureFlags,
    overrides: authenticatedUser.explicitPermissionOverrides,
  });

  return (
    <PresentationalShell
      activeFacilityId={authenticatedUser.activeFacilityId}
      branding={branding}
      contextLabel={dictionary.shell.authenticatedSession}
      navigation={navigation}
      locale={locale}
      onLocaleChange={changeLocale}
      signOut={signOut}
    />
  );
}
