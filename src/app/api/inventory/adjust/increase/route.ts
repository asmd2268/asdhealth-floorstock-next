import { handleInventoryMutation } from "@/server/inventory/http";
export const POST = (request: Request) =>
  handleInventoryMutation(request, "adjust_increase");
