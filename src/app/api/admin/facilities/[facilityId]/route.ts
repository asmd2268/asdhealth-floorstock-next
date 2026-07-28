import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getAdministrationProvisioningService } from "@/server/provisioning/composition";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationFacilitySchema } from "@/server/administration/route-schemas";

export async function PUT(
  request: Request,
  context: { params: Promise<{ facilityId: string }> },
) {
  const facilityId = provisioningIdentifierSchema.safeParse(
    (await context.params).facilityId,
  );
  if (!facilityId.success)
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  return handleAdministrationMutation(
    request,
    administrationFacilitySchema,
    (admin, requestId, body) =>
      getAdministrationProvisioningService().upsertFacility(
        { actor: admin.principal, requestId },
        {
          tenantId: admin.tenantId,
          facility: { id: facilityId.data, ...body },
        },
      ),
  );
}
