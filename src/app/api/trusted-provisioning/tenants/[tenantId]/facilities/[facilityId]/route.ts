import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import { facilityBodySchema } from "@/server/provisioning/route-schemas";

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ tenantId: string; facilityId: string }>;
  },
) {
  const params = await context.params;
  const tenantId = provisioningIdentifierSchema.safeParse(params.tenantId);
  const facilityId = provisioningIdentifierSchema.safeParse(params.facilityId);
  if (!tenantId.success || !facilityId.success) {
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400 },
    );
  }
  return handleTrustedProvisioningRequest(
    request,
    facilityBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().upsertFacility(requestContext, {
        tenantId: tenantId.data,
        facility: {
          id: facilityId.data,
          organizationId: body.organizationId,
        },
      }),
  );
}
