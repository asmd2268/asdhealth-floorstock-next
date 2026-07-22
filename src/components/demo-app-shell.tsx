"use client";

import { useMemo, useState } from "react";

import { roleIds, type RoleId } from "@/domain/access/types";
import { getDictionary } from "@/i18n/dictionaries";

import type { AppShellProps } from "./app-shell";
import { PresentationalShell } from "./presentational-shell";
import { useShellLocale } from "./use-shell-locale";

export function DemoAppShell({
  authenticatedUser,
  branding,
  featureFlags,
  initialLocale,
}: AppShellProps) {
  const [demoRole, setDemoRole] = useState<RoleId>(
    authenticatedUser.roleAssignments.at(0)?.role ??
      "external_pharmacy_supervisor",
  );
  const { locale, changeLocale } = useShellLocale(initialLocale);
  const dictionary = getDictionary(locale);
  const roleAssignments = useMemo(
    () => [{ role: demoRole, scope: authenticatedUser.activeScope }],
    [authenticatedUser.activeScope, demoRole],
  );

  const roleSelector = (
    <label className="control-field">
      <span>{dictionary.shell.role}</span>
      <select
        value={demoRole}
        onChange={(event) => setDemoRole(event.target.value as RoleId)}
      >
        {roleIds.map((roleId) => (
          <option key={roleId} value={roleId}>
            {dictionary.roles[roleId]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <PresentationalShell
      additionalControls={roleSelector}
      authenticatedUser={authenticatedUser}
      branding={branding}
      contextLabel={dictionary.shell.demoMode}
      featureFlags={featureFlags}
      locale={locale}
      onLocaleChange={changeLocale}
      roleAssignments={roleAssignments}
    />
  );
}
