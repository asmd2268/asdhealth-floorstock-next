import Link from "next/link";
import { canReadFeatures } from "@/domain/administration/authorization";
import { loadAdministrationPageContext } from "@/server/administration/page-context";

export default async function AdministrationHomePage() {
  const { result, dictionary } = await loadAdministrationPageContext();
  if (!result.ok) return null;
  const labels = dictionary.administration;
  const cards = [
    ["/app/admin/users", labels.users, labels.usersDescription],
    ["/app/admin/facilities", labels.facilities, labels.facilitiesDescription],
    ...(canReadFeatures(
      result.value.principal,
      result.value.tenantId,
      result.value.platformId,
    )
      ? ([
          ["/app/admin/features", labels.features, labels.featuresDescription],
        ] as const)
      : []),
    ["/app/admin/audit", labels.audit, labels.auditDescription],
  ] as const;
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.overview}</h2>
        <p>{labels.dashboardDescription}</p>
        <dl>
          <div>
            <dt>{labels.tenant}</dt>
            <dd>{result.value.tenantId}</dd>
          </div>
          <div>
            <dt>{labels.scope}</dt>
            <dd>
              {result.value.principal.kind === "platform_owner"
                ? labels.platformOwner
                : result.value.principal.scope === "unrestricted"
                  ? labels.unrestrictedAdmin
                  : labels.restrictedAdmin}
            </dd>
          </div>
        </dl>
      </div>
      <div className="admin-card-grid">
        {cards.map(([href, title, description]) => (
          <Link className="admin-card" key={href} href={href}>
            <h3>{title}</h3>
            <p>{description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
