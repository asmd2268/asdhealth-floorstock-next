import { describe, expect, it } from "vitest";

import { inventoryBalanceId } from "./balances";
import { reconcileInventorySnapshot } from "./reconciliation";
import type {
  InventoryBalanceRecord,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
} from "./types";

const identity = {
  tenantId: "tenant-1",
  facilityId: "facility-1",
  departmentId: null,
  locationId: "pharmacy-1",
  itemId: "item-1",
  lotId: null,
  expiryDate: null,
  unit: "tablet" as const,
};
const transaction: InventoryTransactionRecord = {
  schemaVersion: 1,
  transactionId: "transaction-1",
  type: "receipt",
  status: "posted",
  actorUid: "actor-1",
  requestId: "request-1",
  tenantId: "tenant-1",
  platformId: "platform-1",
  organizationId: "organization-1",
  facilityId: "facility-1",
  sourceDepartmentId: null,
  destinationDepartmentId: null,
  sourceLocationId: null,
  destinationLocationId: "pharmacy-1",
  reasonCode: null,
  lineCount: 1,
  postedAt: "2028-01-01T00:00:00.000Z",
  metadata: {},
};
const line: InventoryTransactionLineRecord = {
  schemaVersion: 1,
  lineId: "line-1",
  transactionId: "transaction-1",
  lineNumber: 1,
  itemId: "item-1",
  lotId: null,
  expiryDate: null,
  enteredUnit: "tablet",
  enteredQuantity: 10,
  baseUnit: "tablet",
  baseQuantity: 10,
  sourceLocationId: null,
  destinationLocationId: "pharmacy-1",
  floorStockRequestId: null,
  floorStockRequestLineId: null,
};

function balance(lastTransactionId = "transaction-1"): InventoryBalanceRecord {
  return {
    schemaVersion: 1,
    balanceId: inventoryBalanceId(identity),
    ...identity,
    quantity: 10,
    version: 1,
    updatedAt: "2028-01-01T00:00:00.000Z",
    lastTransactionId,
  };
}

describe("inventory reconciliation", () => {
  it("reports a healthy, linked snapshot", () => {
    expect(
      reconcileInventorySnapshot(
        [balance()],
        [transaction],
        new Map([[transaction.transactionId, [line]]]),
      ),
    ).toEqual({
      checkedBalances: 1,
      checkedTransactions: 1,
      checkedLines: 1,
      anomalies: [],
    });
  });

  it("detects dangling balances and malformed transaction lines", () => {
    expect(
      reconcileInventorySnapshot(
        [{ ...balance("missing-transaction"), balanceId: "tampered-balance" }],
        [{ ...transaction, lineCount: 2 }],
        new Map([
          [
            transaction.transactionId,
            [{ ...line, transactionId: "other-transaction", lineNumber: 2 }],
          ],
        ]),
      ).anomalies.map((anomaly) => anomaly.code),
    ).toEqual([
      "balance_identity_mismatch",
      "balance_missing_last_transaction",
      "transaction_line_count_mismatch",
      "transaction_line_identity_mismatch",
      "transaction_line_sequence_mismatch",
    ]);
  });
});
