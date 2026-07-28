import "server-only";

import type {
  AdministrationContext,
  AdministrationResult,
} from "@/domain/administration/types";
import { readUniqueSessionCookie } from "@/server/session/cookies";
import { getServerSessionService } from "@/server/session/composition";
import {
  getServerSessionCookieName,
  type ServerSessionService,
} from "@/server/session/types";
import {
  getTrustedAdministratorPrincipalResolver,
  type TrustedAdministratorPrincipalResolver,
} from "@/server/provisioning/principal-resolver";

export interface AdministrationContextDependencies {
  sessionService(): ServerSessionService;
  principalResolver(): TrustedAdministratorPrincipalResolver;
  production: boolean;
}

const defaults: AdministrationContextDependencies = {
  sessionService: getServerSessionService,
  principalResolver: getTrustedAdministratorPrincipalResolver,
  production: process.env.NODE_ENV === "production",
};

export async function resolveAdministrationContext(
  cookieHeader: string | null,
  dependencies: AdministrationContextDependencies = defaults,
): Promise<AdministrationResult<AdministrationContext>> {
  const cookie = readUniqueSessionCookie(
    cookieHeader,
    getServerSessionCookieName(dependencies.production),
  );
  if (!cookie.ok || !cookie.value)
    return { ok: false, code: "unauthenticated" };

  try {
    const session = await dependencies.sessionService().resolve(cookie.value);
    if (!session.ok) return { ok: false, code: session.code };
    const user = session.value.trusted.user;
    const administrator = await dependencies
      .principalResolver()
      .resolveUid(user.uid);
    if (!administrator.ok) return administrator;
    const principal = administrator.principal;
    if (
      principal.platformId !== user.platformId ||
      (principal.kind === "tenant_admin" &&
        principal.tenantId !== user.tenantId)
    ) {
      return { ok: false, code: "forbidden" };
    }
    return {
      ok: true,
      value: {
        principal,
        tenantId: user.tenantId,
        platformId: user.platformId,
        sessionUid: user.uid,
      },
    };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  }
}
