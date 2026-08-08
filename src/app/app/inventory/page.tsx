import Link from "next/link";

import { InventoryPostingForm } from "@/components/inventory/inventory-posting-form";
import { InventoryProvisioningForms } from "@/components/inventory/inventory-provisioning-forms";
import { baseBrand } from "@/config/platform";
import { resolveScopedPermission } from "@/domain/access/permissions";
import type { InventoryOperation } from "@/domain/inventory/types";
import { inventoryTransactionTypes } from "@/domain/inventory/types";
import type { InventoryReconciliationReport } from "@/domain/inventory/reconciliation";
import type { InventoryReplenishmentRecommendation } from "@/domain/inventory/replenishment";
import { summarizeInventoryOperations } from "@/domain/inventory/operational-report";
import { provisioningIdentifierSchema } from "@/domain/provisioning/schemas";
import {
  inventoryProvisioningOperations,
  inventoryProvisioningResource,
} from "@/domain/inventory/provisioning-types";
import { getInventoryQueryRepository } from "@/server/inventory/repository";
import { loadInventoryPageContext } from "@/server/inventory/page-context";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await loadInventoryPageContext();
  const labels = result.dictionary.inventory;
  if (!result.ok)
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.title}</h1>
        <p>{labels.accessDenied}</p>
        <Link href="/app">{labels.backToApp}</Link>
      </main>
    );
  const params = searchParams ? await searchParams : {};
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const rawItemId = single(params.itemId);
  const rawLocationId = single(params.locationId);
  const rawTransactionType = single(params.transactionType);
  const filters = {
    ...(rawItemId && provisioningIdentifierSchema.safeParse(rawItemId).success
      ? { itemId: rawItemId }
      : {}),
    ...(rawLocationId &&
    provisioningIdentifierSchema.safeParse(rawLocationId).success
      ? { locationId: rawLocationId }
      : {}),
    ...(rawTransactionType &&
    (inventoryTransactionTypes as readonly string[]).includes(
      rawTransactionType,
    )
      ? {
          transactionType:
            rawTransactionType as (typeof inventoryTransactionTypes)[number],
        }
      : {}),
  };
  let directory;
  try {
    directory = await getInventoryQueryRepository().load(
      result.context,
      {},
      filters,
    );
  } catch {
    return (
      <main
        className="inventory-denied"
        dir={result.locale === "ar" ? "rtl" : "ltr"}
      >
        <h1>{labels.title}</h1>
        <p>{labels.error}</p>
        <Link href="/app">{labels.backToApp}</Link>
      </main>
    );
  }
  let reconciliation: InventoryReconciliationReport | null = null;
  try {
    reconciliation = await getInventoryQueryRepository().reconcile(
      result.context,
    );
  } catch {
    reconciliation = null;
  }
  let replenishment: readonly InventoryReplenishmentRecommendation[] | null =
    null;
  try {
    replenishment = await getInventoryQueryRepository().replenishment(
      result.context,
    );
  } catch {
    replenishment = null;
  }
  const actionByOperation = {
    receive: "receive",
    issue: "issue",
    adjust_increase: "adjust",
    adjust_decrease: "adjust",
    transfer: "transfer",
  } as const;
  const operations = (
    Object.keys(actionByOperation) as InventoryOperation[]
  ).filter(
    (operation) =>
      resolveScopedPermission({
        roleAssignments: result.context.roleAssignments,
        resource: "inventory_stock",
        action: actionByOperation[operation],
        subjectScope: result.context.activeScope,
        targetScope: result.context.activeScope,
        featureFlags: result.context.featureFlags,
        overrides: result.context.explicitPermissionOverrides,
      }).allowed,
  );
  const provisioningOperations = inventoryProvisioningOperations.filter(
    (operation) => {
      const targetScope =
        operation === "upsert_item"
          ? {
              kind: "organization" as const,
              platformId: result.context.platformId,
              organizationId: result.context.organizationId,
            }
          : result.context.activeScope;
      return resolveScopedPermission({
        roleAssignments: result.context.roleAssignments,
        resource: inventoryProvisioningResource[operation],
        action: "manage",
        subjectScope: targetScope,
        targetScope,
        featureFlags: result.context.featureFlags,
        overrides: result.context.explicitPermissionOverrides,
      }).allowed;
    },
  );
  const itemName = new Map(
    directory.items.items.map((item) => [
      item.itemId,
      `${item.itemCode} — ${item.genericName}`,
    ]),
  );
  const locationName = new Map(
    directory.locations.items.map((location) => [
      location.locationId,
      location.displayName,
    ]),
  );
  return (
    <div
      className="inventory-shell"
      dir={result.locale === "ar" ? "rtl" : "ltr"}
    >
      <header>
        <div>
          <p>{baseBrand.productName}</p>
          <h1>{labels.title}</h1>
          <span>{labels.subtitle}</span>
        </div>
        <Link href="/app">{labels.backToApp}</Link>
      </header>
      <main>
        <InventoryProvisioningForms
          operations={provisioningOperations}
          labels={labels.provisioning}
        />
        <InventoryPostingForm
          items={directory.items.items}
          locations={directory.locations.items}
          operations={operations}
          labels={labels}
        />
        <section className="inventory-replenishment">
          <h2>{labels.replenishment}</h2>
          <p>{labels.replenishmentDescription}</p>
          {replenishment?.length ? (
            <>
              <div className="inventory-reconciliation-summary">
                {(() => {
                  const summary = summarizeInventoryOperations(replenishment);
                  return (
                    <>
                      <span>
                        {labels.configurations}: {summary.configurationCount}
                      </span>
                      <span>
                        {labels.belowReorder}: {summary.belowReorderCount}
                      </span>
                      <span>
                        {labels.recommended}: {summary.recommendedUnitCount}
                      </span>
                    </>
                  );
                })()}
              </div>
              <div className="inventory-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{labels.medication}</th>
                      <th>{labels.location}</th>
                      <th>{labels.current}</th>
                      <th>{labels.reorderThreshold}</th>
                      <th>{labels.recommended}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replenishment.map((row) => {
                      const item = directory.items.items.find(
                        (candidate) => candidate.itemId === row.itemId,
                      );
                      const location = directory.locations.items.find(
                        (candidate) => candidate.locationId === row.locationId,
                      );
                      return (
                        <tr key={row.configurationId}>
                          <td>{item?.itemCode ?? row.itemId}</td>
                          <td>{location?.displayName ?? row.locationId}</td>
                          <td>
                            {row.currentQuantity} {row.unit}
                          </td>
                          <td>
                            {row.reorderThreshold} {row.unit}
                          </td>
                          <td>
                            {row.recommendedQuantity} {row.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : replenishment ? (
            <p>{labels.noReplenishment}</p>
          ) : (
            <p>{labels.replenishmentUnavailable}</p>
          )}
        </section>
        <section className="inventory-reconciliation">
          <h2>{labels.reconciliation}</h2>
          <p>{labels.reconciliationDescription}</p>
          <form method="get" className="inventory-filter-form">
            <label>
              {labels.itemCode}
              <select name="itemId" defaultValue={filters.itemId ?? ""}>
                <option value="">{labels.clearFilters}</option>
                {directory.items.items.map((item) => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.itemCode} — {item.genericName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {labels.location}
              <select name="locationId" defaultValue={filters.locationId ?? ""}>
                <option value="">{labels.clearFilters}</option>
                {directory.locations.items.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {labels.operation}
              <select
                name="transactionType"
                defaultValue={filters.transactionType ?? ""}
              >
                <option value="">{labels.clearFilters}</option>
                {inventoryTransactionTypes.map((type) => (
                  <option key={type} value={type}>
                    {labels.transactionTypes[type]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{labels.filter}</button>
          </form>
          {reconciliation ? (
            <>
              <div className="inventory-reconciliation-summary">
                <span>
                  {labels.checkedBalances}: {reconciliation.checkedBalances}
                </span>
                <span>
                  {labels.checkedTransactions}:{" "}
                  {reconciliation.checkedTransactions}
                </span>
                <span>
                  {labels.checkedLines}: {reconciliation.checkedLines}
                </span>
              </div>
              {reconciliation.anomalies.length ? (
                <ul>
                  {reconciliation.anomalies.map((anomaly) => (
                    <li key={`${anomaly.code}:${anomaly.recordId}`}>
                      {anomaly.code} · {anomaly.recordId} · {anomaly.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{labels.healthy}</p>
              )}
            </>
          ) : (
            <p>{labels.reconciliationUnavailable}</p>
          )}
        </section>
        <section>
          <h2>{labels.items}</h2>
          {directory.items.items.length ? (
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{labels.itemCode}</th>
                    <th>{labels.medication}</th>
                    <th>{labels.unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.items.items.map((item) => (
                    <tr key={item.itemId}>
                      <td>{item.itemCode}</td>
                      <td>
                        {item.genericName} {item.strength}
                      </td>
                      <td>{item.baseUnit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{labels.empty}</p>
          )}
        </section>
        <section>
          <h2>{labels.locations}</h2>
          {directory.locations.items.length ? (
            <ul>
              {directory.locations.items.map((location) => (
                <li key={location.locationId}>{location.displayName}</li>
              ))}
            </ul>
          ) : (
            <p>{labels.empty}</p>
          )}
        </section>
        <section>
          <h2>{labels.balances}</h2>
          {directory.balances.items.length ? (
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{labels.medication}</th>
                    <th>{labels.location}</th>
                    <th>{labels.lot}</th>
                    <th>{labels.expiry}</th>
                    <th>{labels.quantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.balances.items.map((balance) => (
                    <tr key={balance.balanceId}>
                      <td>{itemName.get(balance.itemId) ?? balance.itemId}</td>
                      <td>
                        {locationName.get(balance.locationId) ??
                          balance.locationId}
                      </td>
                      <td>{balance.lotId ?? "—"}</td>
                      <td>{balance.expiryDate ?? "—"}</td>
                      <td>
                        {balance.quantity} {balance.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{labels.empty}</p>
          )}
        </section>
        <section>
          <h2>{labels.transactions}</h2>
          {directory.transactions.items.length ? (
            <ul>
              {directory.transactions.items.map((transaction) => (
                <li key={transaction.transactionId}>
                  {labels.transactionTypes[transaction.type]} ·{" "}
                  {transaction.lineCount} ·{" "}
                  <time dateTime={transaction.postedAt}>
                    {transaction.postedAt}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p>{labels.empty}</p>
          )}
        </section>
      </main>
      <footer>{baseBrand.ownerText}</footer>
    </div>
  );
}
