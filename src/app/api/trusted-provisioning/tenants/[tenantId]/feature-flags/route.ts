import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import { featureFlagsBodySchema } from "@/server/provisioning/route-schemas";

export async function PUT(
  request: Request,
  context: { params: Promise<{ tenantId: string }> },
) {
  const tenantId = provisioningIdentifierSchema.safeParse(
    (await context.params).tenantId,
  );
  if (!tenantId.success) {
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400 },
    );
  }
  return handleTrustedProvisioningRequest(
    request,
    featureFlagsBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().replaceFeatureFlags(requestContext, {
        tenantId: tenantId.data,
        featureFlags: body.featureFlags,
      }),
  );
}
