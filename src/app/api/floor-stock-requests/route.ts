import { handleFloorStockRequestMutation } from "@/server/requests/http";

export const POST = (request: Request) =>
  handleFloorStockRequestMutation(request, "create");
