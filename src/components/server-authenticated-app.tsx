"use client";

import { getDictionary, type Locale } from "@/i18n/dictionaries";
import { signOutServerSession } from "@/services/auth/server-session-controller";
import { getBrowserServerSessionTransport } from "@/services/auth/server-session-transport";
import type { SignOutService } from "@/services/contracts/auth";
import type { BrowserServerSessionTransport } from "@/services/contracts/server-session";
import { getFirebaseAuthenticationProvider } from "@/services/firebase/auth-adapter";

import {
  PresentationalShell,
  type ShellBrandingConfiguration,
  type ShellNavigationItem,
} from "./presentational-shell";
import { useShellLocale } from "./use-shell-locale";

export interface ServerAuthenticatedAppProps {
  activeFacilityId: string;
  branding: ShellBrandingConfiguration;
  navigation: readonly ShellNavigationItem[];
  initialLocale: Locale;
}

export async function coordinateServerSignOut(
  transport: Pick<BrowserServerSessionTransport, "revoke">,
  providerSignOut: SignOutService["signOut"],
  navigateToSignedOutPage: () => void,
): ReturnType<SignOutService["signOut"]> {
  const result = await signOutServerSession(
    { signOut: providerSignOut },
    transport,
  );
  if (!result.ok) return result;
  navigateToSignedOutPage();
  return { ok: true };
}

export function ServerAuthenticatedApp(props: ServerAuthenticatedAppProps) {
  const { locale, changeLocale } = useShellLocale(props.initialLocale);
  const dictionary = getDictionary(locale);
  const signOut = () =>
    coordinateServerSignOut(
      getBrowserServerSessionTransport(),
      () => getFirebaseAuthenticationProvider().signOut(),
      () => window.location.assign("/"),
    );

  return (
    <PresentationalShell
      activeFacilityId={props.activeFacilityId}
      branding={props.branding}
      contextLabel={dictionary.shell.authenticatedSession}
      locale={locale}
      navigation={props.navigation}
      onLocaleChange={changeLocale}
      signOut={signOut}
    />
  );
}
