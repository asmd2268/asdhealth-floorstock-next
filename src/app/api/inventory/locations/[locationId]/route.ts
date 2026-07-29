import { handleInventoryProvisioningMutation } from "@/server/inventory/provisioning-http";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await params;
  return handleInventoryProvisioningMutation(
    request,
    "upsert_location",
    locationId,
  );
}
