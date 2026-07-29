import { handleInventoryProvisioningMutation } from "@/server/inventory/provisioning-http";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ configurationId: string }> },
) {
  const { configurationId } = await params;
  return handleInventoryProvisioningMutation(
    request,
    "upsert_floor_stock_configuration",
    configurationId,
  );
}
