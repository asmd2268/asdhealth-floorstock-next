import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import { departmentBodySchema } from "@/server/provisioning/route-schemas";

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ tenantId: string; departmentId: string }>;
  },
) {
  const params = await context.params;
  const tenantId = provisioningIdentifierSchema.safeParse(params.tenantId);
  const departmentId = provisioningIdentifierSchema.safeParse(
    params.departmentId,
  );
  if (!tenantId.success || !departmentId.success) {
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400 },
    );
  }
  return handleTrustedProvisioningRequest(
    request,
    departmentBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().upsertDepartment(requestContext, {
        tenantId: tenantId.data,
        department: { id: departmentId.data, ...body },
      }),
  );
}
