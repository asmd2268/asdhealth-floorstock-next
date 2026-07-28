import { notFound } from "next/navigation";

import { AccountStatusControl } from "@/components/administration/account-status-control";
import { MembershipForm } from "@/components/administration/membership-form";
import {
  AssignRoleForm,
  RevokeRoleButton,
} from "@/components/administration/role-controls";
import { loadAdministrationPageContext } from "@/server/administration/page-context";
import { getAdministrationQueryService } from "@/server/administration/composition";

export default async function AdministrationUserPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { result: context, dictionary } = await loadAdministrationPageContext();
  if (!context.ok) return null;
  const { uid } = await params;
  const service = getAdministrationQueryService();
  const [userResult, directoryResult] = await Promise.all([
    service.user(context.value, uid),
    service.directory(context.value),
  ]);
  if (!userResult.ok) {
    if (
      userResult.code === "not_found" ||
      userResult.code === "invalid_request"
    )
      notFound();
    return <p role="alert">{dictionary.administration.unavailable}</p>;
  }
  if (!directoryResult.ok)
    return <p role="alert">{dictionary.administration.unavailable}</p>;
  const user = userResult.value;
  const directory = directoryResult.value;
  const labels = dictionary.administration;
  const mayMutateTarget = user.uid !== context.value.sessionUid;
  const assignmentScopes = [
    ...(context.value.principal.kind === "platform_owner"
      ? [
          {
            id: `platform:${context.value.platformId}`,
            label: context.value.platformId,
            scope: {
              kind: "platform" as const,
              platformId: context.value.platformId,
            },
          },
        ]
      : []),
    ...(user.organizationId
      ? [
          {
            id: `organization:${user.organizationId}`,
            label: user.organizationId,
            scope: {
              kind: "organization" as const,
              platformId: context.value.platformId,
              organizationId: user.organizationId,
            },
          },
        ]
      : []),
    ...directory.facilities
      .filter((facility) => user.facilityIds.includes(facility.id))
      .map((facility) => ({
        id: `facility:${facility.id}`,
        label: facility.displayName ?? facility.id,
        scope: {
          kind: "facility" as const,
          platformId: context.value.platformId,
          organizationId: facility.organizationId,
          facilityId: facility.id,
        },
      })),
  ];
  const mutationLabels = {
    saving: labels.saving,
    success: labels.success,
    error: labels.mutationError,
  };
  const scopeLabel = (
    scope: (typeof user.roleAssignments)[number]["scope"],
  ) => {
    if (scope.kind === "platform")
      return `${labels.scope}: ${scope.platformId}`;
    if (scope.kind === "organization")
      return `${labels.organization}: ${scope.organizationId}`;
    return `${labels.facility}: ${directory.facilities.find((item) => item.id === scope.facilityId)?.displayName ?? scope.facilityId}`;
  };
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.details}</h2>
        <p>
          <code>{user.uid}</code>
        </p>
      </div>
      <section className="admin-panel">
        <h3>{labels.accountStatus}</h3>
        <p>{labels[user.accountStatus]}</p>
        {mayMutateTarget && (
          <AccountStatusControl
            uid={user.uid}
            status={user.accountStatus}
            labels={{
              ...mutationLabels,
              activate: labels.activate,
              deactivate: labels.deactivate,
              confirmDeactivate: labels.confirmDeactivate,
              cancel: labels.cancel,
            }}
          />
        )}
      </section>
      <section className="admin-panel">
        <h3>{labels.membership}</h3>
        {mayMutateTarget ? (
          <MembershipForm
            uid={user.uid}
            organizationId={user.organizationId}
            facilityIds={user.facilityIds}
            activeFacilityId={user.activeFacilityId}
            organizations={directory.organizations}
            facilities={directory.facilities}
            labels={{
              organization: labels.organization,
              facilities: labels.facilitiesLabel,
              activeFacility: labels.activeFacility,
              save: labels.save,
              ...mutationLabels,
            }}
          />
        ) : (
          <p>{user.facilityIds.join(", ")}</p>
        )}
      </section>
      <section className="admin-panel">
        <h3>{labels.roles}</h3>
        {user.roleAssignments.length === 0 ? (
          <p>{labels.empty}</p>
        ) : (
          <ul className="admin-role-list">
            {user.roleAssignments.map((assignment) => (
              <li key={assignment.assignmentId}>
                <span>
                  <strong>{dictionary.roles[assignment.roleId]}</strong>
                  <span>{scopeLabel(assignment.scope)}</span>
                </span>
                {mayMutateTarget && (
                  <RevokeRoleButton
                    uid={user.uid}
                    assignmentId={assignment.assignmentId}
                    labels={{ revoke: labels.revoke, ...mutationLabels }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {mayMutateTarget && (
          <AssignRoleForm
            uid={user.uid}
            scopes={assignmentScopes}
            labels={{
              role: labels.role,
              scope: labels.assignmentScope,
              assign: labels.assign,
              revoke: labels.revoke,
              roleNames: dictionary.roles,
              ...mutationLabels,
            }}
          />
        )}
      </section>
    </main>
  );
}
