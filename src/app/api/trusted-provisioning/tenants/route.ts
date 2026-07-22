import { createTenantSchema } from "@/domain/provisioning/schemas";
import { getTrustedProvisioningService } from "@/server/provisioning/composition";
import { handleTrustedProvisioningRequest } from "@/server/provisioning/http";

export async function POST(request: Request) {
  return handleTrustedProvisioningRequest(
    request,
    createTenantSchema,
    (context, body) =>
      getTrustedProvisioningService().createTenant(context, body),
  );
}
