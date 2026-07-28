"use client";

import { getDictionary, type Locale } from "@/i18n/dictionaries";
import { signOutServerSession } from "@/services/auth/server-session-controller";
import { getBrowserServerSessionTransport } from "@/services/auth/server-session-transport";
import type { SignOutService } from "@/services/contracts/auth";
import type {
  BrowserServerSessionTransport,
  FacilityDisplayOption,
} from "@/services/contracts/server-session";
import { getFirebaseAuthenticationProvider } from "@/services/firebase/auth-adapter";

import {
  PresentationalShell,
  type ShellBrandingConfiguration,
  type ShellNavigationItem,
} from "./presentational-shell";
import { FacilitySwitcher } from "./facility-switcher";
import { useShellLocale } from "./use-shell-locale";

export interface ServerAuthenticatedAppProps {
  activeFacilityId: string;
  facilities: readonly FacilityDisplayOption[];
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
  const activeFacilityName =
    props.facilities.find((facility) => facility.id === props.activeFacilityId)
      ?.displayName ?? props.activeFacilityId;

  return (
    <PresentationalShell
      activeFacilityId={props.activeFacilityId}
      activeFacilityName={activeFacilityName}
      additionalControls={
        <FacilitySwitcher
          activeFacilityId={props.activeFacilityId}
          facilities={props.facilities}
          locale={locale}
          refreshApplication={() => window.location.replace("/app")}
          switchFacility={(facilityId) =>
            getBrowserServerSessionTransport().switchFacility(facilityId)
          }
        />
      }
      branding={props.branding}
      contextLabel={dictionary.shell.authenticatedSession}
      locale={locale}
      navigation={props.navigation}
      onLocaleChange={changeLocale}
      signOut={signOut}
    />
  );
}
