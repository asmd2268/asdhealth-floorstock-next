import "server-only";

import {
  getFirestore,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";

import { resolveScopedPermission } from "@/domain/access/permissions";
import type { PermissionAction, ResourceId } from "@/domain/access/types";
import { resolveSession } from "@/domain/auth/session-resolver";
import type {
  InventoryStore,
  InventoryTransactionStore,
} from "@/domain/inventory/store";
import type { InventoryActorContext } from "@/domain/inventory/types";
import { getFirebaseAdminApp } from "@/server/firebase-admin/app";
import {
  fingerprintTrustedAuthorization,
  trustedAuthorizationFingerprintMatches,
} from "@/server/session/trusted-authorization";
import { trustedSessionPaths } from "@/services/firebase/firestore-paths";
import {
  parseTrustedRoleAssignment,
  parseTrustedTenantDirectory,
  parseTrustedUserProfile,
} from "@/services/firebase/trusted-session-records";
import { trustedSessionLimits } from "@/services/firebase/trusted-session-limits";

import { inventoryPaths } from "./paths";

const actionByOperation = {
  receive: "receive",
  issue: "issue",
  adjust_increase: "adjust",
  adjust_decrease: "adjust",
  transfer: "transfer",
} as const;

const path = (segments: readonly string[]) => segments.join("/");

async function raw(
  transaction: Transaction,
  firestore: Firestore,
  segments: readonly string[],
) {
  const snapshot = await transaction.get(firestore.doc(path(segments)));
  return snapshot.exists ? snapshot.data() : null;
}

export async function revalidateInventoryActorPermission(
  transaction: Transaction,
  firestore: Firestore,
  context: InventoryActorContext,
  resource: ResourceId,
  action: PermissionAction,
  scope: "facility" | "organization" = "facility",
): Promise<boolean> {
  try {
    const profileRaw = await raw(
      transaction,
      firestore,
      trustedSessionPaths.userProfile(context.uid),
    );
    if (!profileRaw) return false;
    const profile = parseTrustedUserProfile(profileRaw);
    if (profile.tenantId !== context.tenantId) return false;
    const query: Query = firestore
      .collection(path(trustedSessionPaths.roleAssignments(context.uid)))
      .where("uid", "==", context.uid)
      .where("tenantId", "==", context.tenantId)
      .limit(trustedSessionLimits.roleAssignments + 1);
    const assignmentSnapshot = await transaction.get(query);
    if (assignmentSnapshot.size > trustedSessionLimits.roleAssignments)
      return false;
    const assignments = assignmentSnapshot.docs.map((document) => {
      const value = parseTrustedRoleAssignment(document.data());
      if (value.uid !== context.uid || value.tenantId !== context.tenantId)
        throw new Error("Trusted assignment mismatch");
      return value;
    });
    const directoryRaw = await raw(
      transaction,
      firestore,
      trustedSessionPaths.tenantDirectory(context.tenantId),
    );
    if (!directoryRaw) return false;
    const directory = parseTrustedTenantDirectory(directoryRaw);
    const trusted = resolveSession({
      identity: { uid: context.uid, email: null, displayName: null },
      profile,
      roleAssignments: assignments,
      tenantDirectory: directory,
      requestedActiveFacilityId: context.activeFacilityId,
    });
    if (!trusted.ok || trusted.user.organizationId === null) return false;
    if (
      trusted.user.tenantId !== context.tenantId ||
      trusted.user.platformId !== context.platformId ||
      trusted.user.organizationId !== context.organizationId ||
      trusted.user.activeFacilityId !== context.activeFacilityId ||
      trusted.user.activeScope.kind !== "facility" ||
      !trustedAuthorizationFingerprintMatches(
        fingerprintTrustedAuthorization(trusted),
        context.trustedStateFingerprint,
      )
    )
      return false;
    const targetScope =
      scope === "organization"
        ? {
            kind: "organization" as const,
            platformId: context.platformId,
            organizationId: context.organizationId,
          }
        : trusted.user.activeScope;
    return resolveScopedPermission({
      roleAssignments: trusted.user.roleAssignments,
      resource,
      action,
      subjectScope: targetScope,
      targetScope,
      featureFlags: trusted.featureFlags,
      overrides: trusted.user.explicitPermissionOverrides,
    }).allowed;
  } catch {
    return false;
  }
}

function adapter(
  firestore: Firestore,
  transaction: Transaction,
): InventoryTransactionStore {
  return {
    revalidateActor: (context, operation) =>
      revalidateInventoryActorPermission(
        transaction,
        firestore,
        context,
        "inventory_stock",
        actionByOperation[operation],
      ),
    getItem: (itemId) =>
      raw(transaction, firestore, inventoryPaths.item(itemId)),
    getLocation: (locationId) =>
      raw(transaction, firestore, inventoryPaths.location(locationId)),
    getLot: (lotId) => raw(transaction, firestore, inventoryPaths.lot(lotId)),
    getBalance: (balanceId) =>
      raw(transaction, firestore, inventoryPaths.balance(balanceId)),
    getRequest: (namespaceId) =>
      raw(transaction, firestore, inventoryPaths.request(namespaceId)),
    createTransaction: (record) =>
      transaction.create(
        firestore.doc(path(inventoryPaths.transaction(record.transactionId))),
        record,
      ),
    createLine: (record) =>
      transaction.create(
        firestore.doc(
          path(inventoryPaths.line(record.transactionId, record.lineId)),
        ),
        record,
      ),
    setBalance: (record) =>
      transaction.set(
        firestore.doc(path(inventoryPaths.balance(record.balanceId))),
        record,
      ),
    createAudit: (record) =>
      transaction.create(
        firestore.doc(path(inventoryPaths.audit(record.eventId))),
        record,
      ),
    createRequest: (record) =>
      transaction.create(
        firestore.doc(path(inventoryPaths.request(record.namespaceId))),
        record,
      ),
  };
}

export function createFirestoreInventoryStore(
  firestore: Firestore,
): InventoryStore {
  return {
    runTransaction: (operation) =>
      firestore.runTransaction((transaction) =>
        operation(adapter(firestore, transaction)),
      ),
  };
}

let singleton: InventoryStore | undefined;
export function getFirestoreInventoryStore(): InventoryStore {
  singleton ??= createFirestoreInventoryStore(
    getFirestore(getFirebaseAdminApp()),
  );
  return singleton;
}
