import { handleInventoryProvisioningMutation } from "@/server/inventory/provisioning-http";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  return handleInventoryProvisioningMutation(request, "upsert_item", itemId);
}
