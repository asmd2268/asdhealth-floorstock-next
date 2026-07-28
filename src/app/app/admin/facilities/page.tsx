import { FacilityForm } from "@/components/administration/facility-form";
import { loadAdministrationPageContext } from "@/server/administration/page-context";
import { getAdministrationQueryService } from "@/server/administration/composition";

export default async function AdministrationFacilitiesPage() {
  const { result: context, dictionary } = await loadAdministrationPageContext();
  if (!context.ok) return null;
  const result = await getAdministrationQueryService().directory(context.value);
  const labels = dictionary.administration;
  if (!result.ok)
    return (
      <main>
        <h2>{labels.facilities}</h2>
        <p role="alert">{labels.unavailable}</p>
      </main>
    );
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.facilities}</h2>
        <p>{labels.facilitiesDescription}</p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{labels.facilityId}</th>
                <th>{labels.organization}</th>
                <th>{labels.displayName}</th>
              </tr>
            </thead>
            <tbody>
              {result.value.facilities.map((facility) => (
                <tr key={facility.id}>
                  <td>
                    <code>{facility.id}</code>
                  </td>
                  <td>{facility.organizationId}</td>
                  <td>{facility.displayName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-panel">
        <h3>{labels.createOrUpdate}</h3>
        <FacilityForm
          organizations={result.value.organizations}
          labels={{
            facilityId: labels.facilityId,
            organization: labels.organization,
            displayName: labels.displayName,
            submit: labels.createOrUpdate,
            saving: labels.saving,
            success: labels.success,
            error: labels.mutationError,
          }}
        />
      </section>
    </main>
  );
}
