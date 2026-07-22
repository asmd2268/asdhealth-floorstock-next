"use client";

import { useEffect, useState } from "react";

import { failClosedFeatureFlags } from "@/config/platform";
import type { BrandingConfiguration } from "@/domain/platform/types";
import type { Locale } from "@/i18n/dictionaries";
import { getFirebaseAuthenticationController } from "@/services/auth/firebase-client";
import type { AuthenticationSnapshot } from "@/services/contracts/auth";

import { AuthenticationBoundary } from "./authentication-boundary";

const initialSnapshot: AuthenticationSnapshot = {
  authenticationState: { status: "loading" },
  featureFlags: failClosedFeatureFlags,
};

export interface FirebaseAuthenticationBoundaryProps {
  branding: BrandingConfiguration;
  initialLocale: Locale;
}

export function FirebaseAuthenticationBoundary({
  branding,
  initialLocale,
}: FirebaseAuthenticationBoundaryProps) {
  const [controller] = useState(getFirebaseAuthenticationController);
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => controller.start(setSnapshot), [controller]);

  return (
    <AuthenticationBoundary
      authenticationState={snapshot.authenticationState}
      branding={branding}
      featureFlags={snapshot.featureFlags}
      initialLocale={initialLocale}
      signIn={controller.signIn}
      signOut={controller.signOut}
    />
  );
}
