import "server-only";

import { createInventoryService, type InventoryService } from "./service";
import { getFirestoreInventoryStore } from "./firestore-store";

let service: InventoryService | undefined;

export function getInventoryService(): InventoryService {
  service ??= createInventoryService(getFirestoreInventoryStore());
  return service;
}
