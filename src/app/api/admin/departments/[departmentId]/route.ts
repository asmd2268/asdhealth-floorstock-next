import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationDepartmentSchema } from "@/server/administration/route-schemas";
import { getAdministrationProvisioningService } from "@/server/provisioning/composition";

export async function PUT(
  request: Request,
  context: { params: Promise<{ departmentId: string }> },
) {
  const departmentId = provisioningIdentifierSchema.safeParse(
    (await context.params).departmentId,
  );
  if (!departmentId.success)
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  return handleAdministrationMutation(
    request,
    administrationDepartmentSchema,
    (admin, requestId, body) =>
      getAdministrationProvisioningService().upsertDepartment(
        { actor: admin.principal, requestId },
        {
          tenantId: admin.tenantId,
          department: { id: departmentId.data, ...body },
        },
      ),
  );
}
