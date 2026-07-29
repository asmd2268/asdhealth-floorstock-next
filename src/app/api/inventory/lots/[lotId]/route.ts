import { handleInventoryProvisioningMutation } from "@/server/inventory/provisioning-http";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ lotId: string }> },
) {
  const { lotId } = await params;
  return handleInventoryProvisioningMutation(request, "upsert_lot", lotId);
}
