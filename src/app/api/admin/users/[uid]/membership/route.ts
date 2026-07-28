import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getAdministrationProvisioningService } from "@/server/provisioning/composition";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationMembershipSchema } from "@/server/administration/route-schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const uid = provisioningIdentifierSchema.safeParse(
    (await context.params).uid,
  );
  if (!uid.success)
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  return handleAdministrationMutation(
    request,
    administrationMembershipSchema,
    (admin, requestId, body) =>
      getAdministrationProvisioningService().updateUserMembership(
        { actor: admin.principal, requestId },
        { uid: uid.data, tenantId: admin.tenantId, ...body },
      ),
  );
}
