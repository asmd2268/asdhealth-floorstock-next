import "server-only";

import {
  createInventoryProvisioningService,
  type InventoryProvisioningService,
} from "@/domain/inventory/provisioning-service";

import { getFirestoreInventoryProvisioningStore } from "./provisioning-firestore-store";

let service: InventoryProvisioningService | undefined;

export function getInventoryProvisioningService() {
  service ??= createInventoryProvisioningService(
    getFirestoreInventoryProvisioningStore(),
  );
  return service;
}
