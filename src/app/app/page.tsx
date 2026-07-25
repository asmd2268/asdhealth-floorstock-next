import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ServerAuthenticatedApp } from "@/components/server-authenticated-app";
import { baseBrand } from "@/config/platform";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { getVisibleNavigation } from "@/navigation/navigation";
import { getServerSessionService } from "@/server/session/composition";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionCookieName } from "@/server/session/types";

export default async function ProtectedApplicationPage() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const sessionCookie = readUniqueSessionCookie(
    requestHeaders.get("cookie"),
    getServerSessionCookieName(process.env.NODE_ENV === "production"),
  );
  if (!sessionCookie.ok) redirect("/");
  let session: Awaited<
    ReturnType<ReturnType<typeof getServerSessionService>["resolve"]>
  >;
  try {
    session = await getServerSessionService().authorize(sessionCookie.value, {
      resource: "dashboard",
      action: "read",
    });
  } catch {
    redirect("/");
  }
  if (!session.ok) redirect("/");
  const { user, featureFlags } = session.value.trusted;
  const navigation = getVisibleNavigation({
    roleAssignments: user.roleAssignments,
    subjectScope: user.activeScope,
    targetScope: user.activeScope,
    featureFlags,
    overrides: user.explicitPermissionOverrides,
  }).map(({ id, targetId, href }) => ({ id, targetId, href }));
  const shellBranding = {
    productName: baseBrand.productName,
    clientDisplayName: baseBrand.clientDisplayName,
    ownerText: baseBrand.ownerText,
    logoUrl: baseBrand.logoUrl,
    primaryAccentToken: baseBrand.primaryAccentToken,
  };

  return (
    <ServerAuthenticatedApp
      activeFacilityId={user.activeFacilityId}
      branding={shellBranding}
      navigation={navigation}
      initialLocale={resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value)}
    />
  );
}
