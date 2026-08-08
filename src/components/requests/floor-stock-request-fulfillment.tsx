"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { FloorStockRequestFulfillmentDetail } from "@/domain/requests/types";
import type { Dictionary } from "@/i18n/dictionaries";

export function FloorStockRequestFulfillment({
  detail,
  labels,
}: {
  detail: FloorStockRequestFulfillmentDetail;
  labels: Dictionary["requests"];
}) {
  const router = useRouter();
  const sources = useMemo(
    () => [
      ...new Map(
        detail.lines.flatMap((line) =>
          line.options.map(
            (option) =>
              [option.sourceLocationId, option.sourceLocationName] as const,
          ),
        ),
      ),
    ],
    [detail.lines],
  );
  const [sourceLocationId, setSourceLocationId] = useState(
    sources[0]?.[0] ?? "",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<"success" | "error" | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !sourceLocationId) return;
    const data = new FormData(event.currentTarget);
    const lines = detail.lines.map((line) => ({
      requestLineId: line.requestLineId,
      allocations: line.options
        .filter((option) => option.sourceLocationId === sourceLocationId)
        .map((option) => ({
          balanceId: option.balanceId,
          quantity: Number(
            data.get(`allocation:${line.requestLineId}:${option.balanceId}`) ??
              0,
          ),
        }))
        .filter((allocation) => allocation.quantity > 0),
    }));
    if (
      lines.some(
        (line, index) =>
          line.allocations.length === 0 ||
          line.allocations.some(
            (allocation) => !Number.isSafeInteger(allocation.quantity),
          ) ||
          line.allocations.reduce(
            (sum, allocation) => sum + allocation.quantity,
            0,
          ) !== detail.lines[index]!.approvedQuantity,
      )
    ) {
      setMessage("error");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const body = JSON.stringify({ sourceLocationId, lines });
      const response = await fetch(
        `/api/floor-stock-requests/${encodeURIComponent(detail.floorStockRequestId)}/complete-fulfillment`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-asdhealth-floor-stock-request-action": "complete_fulfillment",
            "x-request-id": crypto.randomUUID(),
          },
          body,
        },
      );
      setMessage(response.ok ? "success" : "error");
      if (response.ok) router.push("/app/requests");
    } catch {
      setMessage("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="request-fulfillment"
      onSubmit={(event) => void submit(event)}
    >
      <label>
        {labels.sourceBalance}
        <select
          required
          value={sourceLocationId}
          onChange={(event) => setSourceLocationId(event.target.value)}
        >
          {sources.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {detail.lines.map((line) => {
        const options = line.options.filter(
          (option) => option.sourceLocationId === sourceLocationId,
        );
        return (
          <fieldset key={line.requestLineId}>
            <legend>
              {line.itemCode} — {line.genericName} {line.strength} ·{" "}
              {line.destinationLocationName}
            </legend>
            <p>
              {labels.quantity}: {line.approvedQuantity} {line.unit}
            </p>
            {options.length ? (
              options.map((option) => (
                <label key={option.balanceId}>
                  {labels.lot}: {option.lotNumber ?? "—"} · {labels.expiry}:{" "}
                  {option.expiryDate ?? "—"} · {labels.available}:{" "}
                  {option.availableQuantity}
                  <input
                    defaultValue="0"
                    max={Math.min(
                      option.availableQuantity,
                      line.approvedQuantity,
                    )}
                    min="0"
                    name={`allocation:${line.requestLineId}:${option.balanceId}`}
                    step="1"
                    type="number"
                  />
                </label>
              ))
            ) : (
              <p>{labels.noStock}</p>
            )}
          </fieldset>
        );
      })}
      <button disabled={pending || sources.length === 0} type="submit">
        {pending ? labels.working : labels.completeFulfillment}
      </button>
      <p aria-live="polite">
        {message === "success"
          ? labels.success
          : message === "error"
            ? labels.error
            : ""}
      </p>
    </form>
  );
}
