import "server-only";

import { cookies, headers } from "next/headers";

import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import { fingerprintTrustedAuthorization } from "@/server/session/trusted-authorization";
import { getServerSessionCookieName } from "@/server/session/types";

export async function loadInventoryPageContext() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);
  const cookie = readUniqueSessionCookie(
    headerStore.get("cookie"),
    getServerSessionCookieName(process.env.NODE_ENV === "production"),
  );
  if (!cookie.ok || !cookie.value)
    return { ok: false as const, locale, dictionary };
  try {
    const session = await getServerSessionService().authorize(cookie.value, {
      resource: "inventory_balance",
      action: "read",
    });
    if (!session.ok) return { ok: false as const, locale, dictionary };
    const { user, featureFlags } = session.value.trusted;
    if (user.organizationId === null || user.activeScope.kind !== "facility")
      return { ok: false as const, locale, dictionary };
    return {
      ok: true as const,
      locale,
      dictionary,
      context: {
        uid: user.uid,
        tenantId: user.tenantId,
        platformId: user.platformId,
        organizationId: user.organizationId,
        activeFacilityId: user.activeFacilityId,
        activeScope: user.activeScope,
        roleAssignments: user.roleAssignments,
        explicitPermissionOverrides: user.explicitPermissionOverrides,
        featureFlags,
        trustedStateFingerprint: fingerprintTrustedAuthorization(
          session.value.trusted,
        ),
      },
    };
  } catch {
    return { ok: false as const, locale, dictionary };
  }
}
