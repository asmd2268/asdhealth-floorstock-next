"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeatureFlagSet } from "@/domain/platform/types";
import {
  sendAdministrationMutation,
  type MutationState,
} from "./mutation-client";

const featureIds = [
  "announcements",
  "zebra_labels",
  "new_request",
  "controlled_medicines",
  "inventory",
] as const;

export function FeatureForm({
  initial,
  labels,
}: {
  initial: FeatureFlagSet;
  labels: {
    names: Record<(typeof featureIds)[number], string>;
    enabled: string;
    submit: string;
    saving: string;
    success: string;
    error: string;
  };
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const expectedFlags = useRef(initial);
  const [flags, setFlags] = useState(initial);
  const [state, setState] = useState<MutationState>("idle");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        "/api/admin/features",
        "PUT",
        { featureFlags: flags, expectedFeatureFlags: expectedFlags.current },
      );
      setState(ok ? "success" : "error");
      if (ok) {
        expectedFlags.current = flags;
        router.refresh();
      }
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      {featureIds.map((id) => (
        <label className="feature-toggle" key={id}>
          <span>{labels.names[id]}</span>
          <span>
            <input
              type="checkbox"
              checked={flags[id]}
              onChange={(event) =>
                setFlags((current) => ({
                  ...current,
                  [id]: event.target.checked,
                }))
              }
            />
            {labels.enabled}
          </span>
        </label>
      ))}
      <button disabled={state === "pending"} type="submit">
        {state === "pending" ? labels.saving : labels.submit}
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
