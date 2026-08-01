import { handleFloorStockRequestMutation } from "@/server/requests/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return handleFloorStockRequestMutation(
    request,
    "complete_fulfillment",
    (await context.params).requestId,
  );
}
