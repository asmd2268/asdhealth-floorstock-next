import { FeatureForm } from "@/components/administration/feature-form";
import { loadAdministrationPageContext } from "@/server/administration/page-context";
import { getAdministrationQueryService } from "@/server/administration/composition";

export default async function AdministrationFeaturesPage() {
  const { result: context, dictionary } = await loadAdministrationPageContext();
  if (!context.ok) return null;
  const result = await getAdministrationQueryService().features(context.value);
  const labels = dictionary.administration;
  if (!result.ok)
    return (
      <main>
        <h2>{labels.features}</h2>
        <p role="alert">
          {result.code === "forbidden"
            ? labels.accessDenied
            : labels.unavailable}
        </p>
      </main>
    );
  return (
    <main>
      <div className="admin-page-heading">
        <h2>{labels.features}</h2>
        <p>{labels.featuresDescription}</p>
      </div>
      <section className="admin-panel">
        <FeatureForm
          initial={result.value.featureFlags}
          labels={{
            names: {
              announcements: dictionary.navigation.announcements,
              zebra_labels: dictionary.navigation.zebraLabels,
              new_request: dictionary.navigation.newRequest,
              controlled_medicines: dictionary.navigation.controlledMedicines,
              inventory: dictionary.navigation.inventory,
            },
            enabled: labels.enabled,
            submit: labels.replaceFeatures,
            saving: labels.saving,
            success: labels.success,
            error: labels.mutationError,
          }}
        />
      </section>
    </main>
  );
}
