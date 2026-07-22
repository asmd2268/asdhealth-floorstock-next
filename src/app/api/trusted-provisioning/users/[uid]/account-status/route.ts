import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import { accountStatusBodySchema } from "@/server/provisioning/route-schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const uid = provisioningIdentifierSchema.safeParse(
    (await context.params).uid,
  );
  if (!uid.success) {
    return Response.json(
      { ok: false, error: { code: "invalid_request" } },
      { status: 400 },
    );
  }
  return handleTrustedProvisioningRequest(
    request,
    accountStatusBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().setAccountStatus(requestContext, {
        uid: uid.data,
        ...body,
      }),
  );
}
