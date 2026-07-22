import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";
import { userProfileBodySchema } from "@/server/provisioning/route-schemas";

export async function PUT(
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
    userProfileBodySchema,
    (requestContext, body) =>
      getTrustedProvisioningService().upsertUserProfile(requestContext, {
        uid: uid.data,
        ...body,
      }),
  );
}
