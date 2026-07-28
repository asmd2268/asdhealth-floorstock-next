"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AccountStatus } from "@/domain/auth/types";
import {
  sendAdministrationMutation,
  type MutationState,
} from "./mutation-client";

interface Labels {
  activate: string;
  deactivate: string;
  confirmDeactivate: string;
  cancel: string;
  saving: string;
  success: string;
  error: string;
}

export function AccountStatusControl({
  uid,
  status,
  labels,
}: {
  uid: string;
  status: AccountStatus;
  labels: Labels;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [state, setState] = useState<MutationState>("idle");
  const [confirming, setConfirming] = useState(false);
  const target = status === "active" ? "disabled" : "active";

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("pending");
    try {
      const ok = await sendAdministrationMutation(
        `/api/admin/users/${encodeURIComponent(uid)}/account-status`,
        "PATCH",
        { accountStatus: target },
      );
      setState(ok ? "success" : "error");
      if (ok) router.refresh();
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
      setConfirming(false);
    }
  }

  return (
    <div className="admin-action-stack">
      {target === "disabled" && !confirming ? (
        <button
          className="danger-button"
          type="button"
          onClick={() => setConfirming(true)}
        >
          {labels.deactivate}
        </button>
      ) : target === "disabled" ? (
        <div
          role="group"
          aria-label={labels.confirmDeactivate}
          className="confirmation-box"
        >
          <strong>{labels.confirmDeactivate}</strong>
          <button
            disabled={state === "pending"}
            className="danger-button"
            type="button"
            onClick={submit}
          >
            {state === "pending" ? labels.saving : labels.deactivate}
          </button>
          <button
            disabled={state === "pending"}
            type="button"
            onClick={() => setConfirming(false)}
          >
            {labels.cancel}
          </button>
        </div>
      ) : (
        <button disabled={state === "pending"} type="button" onClick={submit}>
          {state === "pending" ? labels.saving : labels.activate}
        </button>
      )}
      <p className="admin-live-message" aria-live="polite">
        {state === "success"
          ? labels.success
          : state === "error"
            ? labels.error
            : ""}
      </p>
    </div>
  );
}
