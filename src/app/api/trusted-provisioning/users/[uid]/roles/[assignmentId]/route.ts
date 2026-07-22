import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import {
  revokeRoleBodySchema,
  roleAssignmentBodySchema,
} from "@/server/provisioning/route-schemas";

async function parameters(context: {
  params: Promise<{ uid: string; assignmentId: string }>;
}) {
  const raw = await context.params;
  const uid = provisioningIdentifierSchema.safeParse(raw.uid);
  const assignmentId = provisioningIdentifierSchema.safeParse(raw.assignmentId);
  return uid.success && assignmentId.success
    ? { uid: uid.data, assignmentId: assignmentId.data }
    : null;
}

function invalidRequest() {
  return Response.json(
    { ok: false, error: { code: "invalid_request" } },
    { status: 400 },
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ uid: string; assignmentId: string }> },
) {
  const params = await parameters(context);
  if (!params) return invalidRequest();
  return handleTrustedProvisioningRequest(
    request,
    roleAssignmentBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().assignRole(requestContext, {
        ...params,
        ...body,
      }),
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uid: string; assignmentId: string }> },
) {
  const params = await parameters(context);
  if (!params) return invalidRequest();
  return handleTrustedProvisioningRequest(
    request,
    revokeRoleBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().revokeRoleAssignment(requestContext, {
        ...params,
        ...body,
      }),
  );
}
