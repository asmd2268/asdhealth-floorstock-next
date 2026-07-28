import { getAdministrationProvisioningService } from "@/server/provisioning/composition";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationFeatureFlagsSchema } from "@/server/administration/route-schemas";

export async function PUT(request: Request) {
  return handleAdministrationMutation(
    request,
    administrationFeatureFlagsSchema,
    (admin, requestId, body) =>
      getAdministrationProvisioningService().replaceFeatureFlags(
        { actor: admin.principal, requestId },
        {
          tenantId: admin.tenantId,
          featureFlags: body.featureFlags,
          expectedFeatureFlags: body.expectedFeatureFlags,
        },
      ),
  );
}
