import "server-only";

import { cookies, headers } from "next/headers";

import { resolveScopedPermission } from "@/domain/access/permissions";
import { getDictionary } from "@/i18n/dictionaries";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/i18n/locale";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import { fingerprintTrustedAuthorization } from "@/server/session/trusted-authorization";
import { getServerSessionCookieName } from "@/server/session/types";

export async function loadFloorStockRequestPageContext() {
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
      resource: "new_request",
      action: "read",
    });
    if (!session.ok) return { ok: false as const, locale, dictionary };
    const { user, featureFlags } = session.value.trusted;
    if (
      user.organizationId === null ||
      user.activeScope.kind !== "facility" ||
      featureFlags.new_request !== true
    )
      return { ok: false as const, locale, dictionary };
    const permission = (action: "create" | "approve" | "manage") =>
      resolveScopedPermission({
        roleAssignments: user.roleAssignments,
        resource: "new_request",
        action,
        subjectScope: user.activeScope,
        targetScope: user.activeScope,
        featureFlags,
        overrides: user.explicitPermissionOverrides,
      }).allowed;
    const mayApprove = permission("approve");
    const mayManage = permission("manage");
    const mayCreate = permission("create") && user.activeDepartmentId !== null;
    if (!mayApprove && !mayManage && user.activeDepartmentId === null)
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
        activeDepartmentId: user.activeDepartmentId,
        activeScope: user.activeScope,
        roleAssignments: user.roleAssignments,
        explicitPermissionOverrides: user.explicitPermissionOverrides,
        featureFlags,
        trustedStateFingerprint: fingerprintTrustedAuthorization(
          session.value.trusted,
        ),
        departmentOnly: !mayApprove && !mayManage,
        mayCreate,
        mayApprove,
        mayManage,
      },
    };
  } catch {
    return { ok: false as const, locale, dictionary };
  }
}
