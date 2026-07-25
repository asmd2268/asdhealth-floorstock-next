"use client";

import { useMemo, useState } from "react";

import { roleIds, type RoleId } from "@/domain/access/types";
import { getDictionary } from "@/i18n/dictionaries";
import { getVisibleNavigation } from "@/navigation/navigation";

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
  const navigation = getVisibleNavigation({
    roleAssignments,
    subjectScope: authenticatedUser.activeScope,
    targetScope: authenticatedUser.activeScope,
    featureFlags,
    overrides: authenticatedUser.explicitPermissionOverrides,
  });

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
      activeFacilityId={authenticatedUser.activeFacilityId}
      branding={branding}
      contextLabel={dictionary.shell.demoMode}
      navigation={navigation}
      locale={locale}
      onLocaleChange={changeLocale}
    />
  );
}
