import "server-only";

import {
  createFloorStockRequestService,
  type FloorStockRequestService,
} from "@/domain/requests/service";

import { getFirestoreFloorStockRequestStore } from "./firestore-store";

let service: FloorStockRequestService | undefined;
export function getFloorStockRequestService() {
  service ??= createFloorStockRequestService(
    getFirestoreFloorStockRequestStore(),
  );
  return service;
}
