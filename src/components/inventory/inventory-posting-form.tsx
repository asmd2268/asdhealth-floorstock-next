"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type {
  InventoryItemSummary,
  InventoryLocationSummary,
  InventoryOperation,
} from "@/domain/inventory/types";

interface Labels {
  operation: string;
  medication: string;
  source: string;
  destination: string;
  quantity: string;
  unit: string;
  lot: string;
  expiry: string;
  post: string;
  posting: string;
  success: string;
  error: string;
  receive: string;
  issue: string;
  adjustIncrease: string;
  adjustDecrease: string;
  transfer: string;
}

const endpoint: Record<InventoryOperation, string> = {
  receive: "/api/inventory/receive",
  issue: "/api/inventory/issue",
  adjust_increase: "/api/inventory/adjust/increase",
  adjust_decrease: "/api/inventory/adjust/decrease",
  transfer: "/api/inventory/transfer",
};

export function InventoryPostingForm({
  items,
  locations,
  operations,
  labels,
}: {
  items: readonly InventoryItemSummary[];
  locations: readonly InventoryLocationSummary[];
  operations: readonly InventoryOperation[];
  labels: Labels;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "posting" | "success" | "error">(
    "idle",
  );
  if (items.length === 0 || locations.length === 0 || operations.length === 0)
    return null;
  const labelByOperation: Record<InventoryOperation, string> = {
    receive: labels.receive,
    issue: labels.issue,
    adjust_increase: labels.adjustIncrease,
    adjust_decrease: labels.adjustDecrease,
    transfer: labels.transfer,
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "posting") return;
    setState("posting");
    const data = new FormData(event.currentTarget);
    const operation = data.get("operation") as InventoryOperation;
    const selectedItem = items.find(
      (item) => item.itemId === data.get("itemId"),
    );
    if (!selectedItem || !operations.includes(operation))
      return setState("error");
    const line: Record<string, unknown> = {
      itemId: selectedItem.itemId,
      unit: selectedItem.baseUnit,
      quantity: Number(data.get("quantity")),
    };
    if (selectedItem.lotControlled) {
      line.lotId = data.get("lotId");
      line.expiryDate = data.get("expiryDate");
    }
    const sourceLocationId = data.get("sourceLocationId");
    const destinationLocationId = data.get("destinationLocationId");
    const body =
      operation === "receive"
        ? { destinationLocationId, lines: [line] }
        : operation === "issue"
          ? { sourceLocationId, lines: [line] }
          : operation === "transfer"
            ? { sourceLocationId, destinationLocationId, lines: [line] }
            : {
                locationId: sourceLocationId,
                reasonCode: "inventory-adjustment",
                lines: [line],
              };
    try {
      const response = await fetch(endpoint[operation], {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-asdhealth-inventory-action": operation,
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      setState(response.ok ? "success" : "error");
      if (response.ok) router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form className="inventory-form" onSubmit={(event) => void submit(event)}>
      <label>
        {labels.operation}
        <select name="operation">
          {operations.map((value) => (
            <option key={value} value={value}>
              {labelByOperation[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {labels.medication}
        <select name="itemId">
          {items.map((item) => (
            <option key={item.itemId} value={item.itemId}>
              {item.itemCode} — {item.genericName} {item.strength}
            </option>
          ))}
        </select>
      </label>
      <label>
        {labels.source}
        <select name="sourceLocationId">
          {locations.map((location) => (
            <option key={location.locationId} value={location.locationId}>
              {location.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        {labels.destination}
        <select name="destinationLocationId">
          {locations.map((location) => (
            <option key={location.locationId} value={location.locationId}>
              {location.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        {labels.quantity}
        <input min="1" name="quantity" required step="1" type="number" />
      </label>
      <label>
        {labels.lot}
        <input maxLength={128} name="lotId" />
      </label>
      <label>
        {labels.expiry}
        <input name="expiryDate" type="date" />
      </label>
      <button disabled={state === "posting"} type="submit">
        {state === "posting" ? labels.posting : labels.post}
      </button>
      <p aria-live="polite">
        {state === "success"
          ? labels.success
          : state === "error"
            ? labels.error
            : ""}
      </p>
    </form>
  );
}
