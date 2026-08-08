import { inventoryBalanceId } from "./balances";
import type {
  InventoryBalanceRecord,
  InventoryTransactionLineRecord,
  InventoryTransactionRecord,
} from "./types";

export type InventoryReconciliationAnomalyCode =
  | "balance_identity_mismatch"
  | "balance_missing_last_transaction"
  | "transaction_line_count_mismatch"
  | "transaction_line_identity_mismatch"
  | "transaction_line_sequence_mismatch";

export interface InventoryReconciliationAnomaly {
  code: InventoryReconciliationAnomalyCode;
  recordId: string;
  detail: string;
}

export interface InventoryReconciliationReport {
  checkedBalances: number;
  checkedTransactions: number;
  checkedLines: number;
  anomalies: readonly InventoryReconciliationAnomaly[];
}

export function reconcileInventorySnapshot(
  balances: readonly InventoryBalanceRecord[],
  transactions: readonly InventoryTransactionRecord[],
  linesByTransaction: ReadonlyMap<
    string,
    readonly InventoryTransactionLineRecord[]
  >,
): InventoryReconciliationReport {
  const anomalies: InventoryReconciliationAnomaly[] = [];
  const transactionIds = new Set(
    transactions.map((transaction) => transaction.transactionId),
  );
  for (const balance of balances) {
    const identity = {
      tenantId: balance.tenantId,
      facilityId: balance.facilityId,
      departmentId: balance.departmentId,
      locationId: balance.locationId,
      itemId: balance.itemId,
      lotId: balance.lotId,
      expiryDate: balance.expiryDate,
      unit: balance.unit,
    };
    if (inventoryBalanceId(identity) !== balance.balanceId)
      anomalies.push({
        code: "balance_identity_mismatch",
        recordId: balance.balanceId,
        detail: "Balance identity does not match its deterministic ID.",
      });
    if (!transactionIds.has(balance.lastTransactionId))
      anomalies.push({
        code: "balance_missing_last_transaction",
        recordId: balance.balanceId,
        detail: "The balance points to a transaction outside the checked set.",
      });
  }
  let checkedLines = 0;
  for (const transaction of transactions) {
    const lines = linesByTransaction.get(transaction.transactionId) ?? [];
    checkedLines += lines.length;
    if (lines.length !== transaction.lineCount)
      anomalies.push({
        code: "transaction_line_count_mismatch",
        recordId: transaction.transactionId,
        detail: `Header declares ${transaction.lineCount} lines but ${lines.length} were found.`,
      });
    for (const [index, line] of lines.entries()) {
      if (line.transactionId !== transaction.transactionId)
        anomalies.push({
          code: "transaction_line_identity_mismatch",
          recordId: line.lineId,
          detail: "Line transaction identity does not match its parent.",
        });
      if (line.lineNumber !== index + 1)
        anomalies.push({
          code: "transaction_line_sequence_mismatch",
          recordId: line.lineId,
          detail: "Transaction line numbers are not contiguous and ordered.",
        });
    }
  }
  return {
    checkedBalances: balances.length,
    checkedTransactions: transactions.length,
    checkedLines,
    anomalies,
  };
}
