import Link from "next/link";

import { InventoryPostingForm } from "@/components/inventory/inventory-posting-form";
import { InventoryProvisioningForms } from "@/components/inventory/inventory-provisioning-forms";
import { baseBrand } from "@/config/platform";
import { resolveScopedPermission } from "@/domain/access/permissions";
import type { InventoryOperation } from "@/domain/inventory/types";
import {
  inventoryProvisioningOperations,
  inventoryProvisioningResource,
} from "@/domain/inventory/provisioning-types";
import { getInventoryQueryRepository } from "@/server/inventory/repository";
import { loadInventoryPageContext } from "@/server/inventory/page-context";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
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
  let directory;
  try {
    directory = await getInventoryQueryRepository().load(result.context);
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
