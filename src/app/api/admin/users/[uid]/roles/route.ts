import { randomUUID } from "node:crypto";

import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getAdministrationProvisioningService } from "@/server/provisioning/composition";
import { handleAdministrationMutation } from "@/server/administration/http";
import { administrationRoleSchema } from "@/server/administration/route-schemas";

export async function POST(
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
    administrationRoleSchema,
    (admin, requestId, body) =>
      getAdministrationProvisioningService().assignRole(
        { actor: admin.principal, requestId },
        {
          assignmentId: randomUUID(),
          uid: uid.data,
          tenantId: admin.tenantId,
          ...body,
        },
      ),
  );
}
