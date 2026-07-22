import "server-only";

import {
  createTrustedProvisioningService,
  type TrustedProvisioningService,
} from "@/domain/provisioning/service";

import { getFirebaseAdminProvisioningStore } from "../firebase-admin/provisioning-store";

let trustedProvisioningService: TrustedProvisioningService | undefined;

export function getTrustedProvisioningService(): TrustedProvisioningService {
  trustedProvisioningService ??= createTrustedProvisioningService(
    getFirebaseAdminProvisioningStore(),
  );
  return trustedProvisioningService;
}
