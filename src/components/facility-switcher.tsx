"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { getDictionary, type Locale } from "@/i18n/dictionaries";
import type {
  BrowserServerSessionTransport,
  FacilityDisplayOption,
} from "@/services/contracts/server-session";

export interface FacilitySwitcherProps {
  activeFacilityId: string;
  facilities: readonly FacilityDisplayOption[];
  locale: Locale;
  switchFacility: BrowserServerSessionTransport["switchFacility"];
  refreshApplication: () => void;
}

const SWITCH_TIMEOUT_MILLISECONDS = 15_000;

export function FacilitySwitcher({
  activeFacilityId,
  facilities,
  locale,
  refreshApplication,
  switchFacility,
}: FacilitySwitcherProps) {
  const [requestedFacilityId, setRequestedFacilityId] =
    useState(activeFacilityId);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const dictionary = getDictionary(locale);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!inFlight.current) setRequestedFacilityId(activeFacilityId);
  }, [activeFacilityId]);

  if (facilities.length <= 1) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFailed(false);
    const timeout = window.setTimeout(() => {
      if (mounted.current) setFailed(true);
    }, SWITCH_TIMEOUT_MILLISECONDS);
    try {
      const result = await switchFacility(requestedFacilityId);
      if (result.ok && mounted.current) {
        refreshApplication();
        return;
      }
    } catch {
      // The client transport normally normalizes failures; this is a final UI
      // boundary so an unexpected adapter error cannot strand the control.
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
    }
    if (mounted.current) {
      setRequestedFacilityId(activeFacilityId);
      setSubmitting(false);
      setFailed(true);
    }
  };

  return (
    <form
      className="facility-switcher"
      onSubmit={(event) => void submit(event)}
    >
      <label className="control-field facility-field">
        <span>{dictionary.facilitySwitcher.label}</span>
        <select
          aria-label={dictionary.facilitySwitcher.label}
          disabled={submitting}
          value={requestedFacilityId}
          onChange={(event) => setRequestedFacilityId(event.target.value)}
        >
          {facilities.map((facility) => (
            <option key={facility.id} value={facility.id}>
              {facility.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        className="facility-switch-button"
        disabled={submitting}
        type="submit"
      >
        {submitting
          ? dictionary.facilitySwitcher.switching
          : dictionary.facilitySwitcher.switchAction}
      </button>
      {failed ? (
        <span className="facility-switch-error" role="alert">
          {dictionary.facilitySwitcher.error}
        </span>
      ) : null}
    </form>
  );
}
