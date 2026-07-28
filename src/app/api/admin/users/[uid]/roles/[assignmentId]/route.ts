import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getAdministrationProvisioningService } from "@/server/provisioning/composition";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationEmptySchema } from "@/server/administration/route-schemas";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uid: string; assignmentId: string }> },
) {
  const params = await context.params;
  const uid = provisioningIdentifierSchema.safeParse(params.uid);
  const assignmentId = provisioningIdentifierSchema.safeParse(
    params.assignmentId,
  );
  if (!uid.success || !assignmentId.success)
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  return handleAdministrationMutation(
    request,
    administrationEmptySchema,
    (admin, requestId) =>
      getAdministrationProvisioningService().revokeRoleAssignment(
        { actor: admin.principal, requestId },
        {
          assignmentId: assignmentId.data,
          uid: uid.data,
          tenantId: admin.tenantId,
        },
      ),
  );
}
