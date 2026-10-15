import { useEffect, useRef, useState } from "react";
import { askedKey, sendResponse, shuffleOptions } from "./probe";
import { sessionKey, uuid } from "./session";
import type { Cohort, ProbeExposure, ProbePlan, ProbeResponse } from "./types";

export interface ProbeInvitation {
  plan: ProbePlan;
  sessionId: string;
  cohortAtShown: Cohort;
  eventSeqAtShown: number;
}

interface Props {
  invitation: ProbeInvitation;
  onClose: () => void;
}

export function ProbeCard({ invitation, onClose }: Props) {
  const { plan, sessionId } = invitation;
  const [options] = useState(() => shuffleOptions(plan.options));
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const exposure = useRef<ProbeExposure | null>(null);
  const submittedResponse = useRef<ProbeResponse | null>(null);

  useEffect(() => {
    if (
      !exposure.current &&
      (Date.now() >= Date.parse(plan.ends_at) || plan.closed_hint)
    ) {
      onClose();
      return;
    }
    if (!exposure.current) {
      exposure.current = {
        exposure_id: uuid(),
        plan_id: plan.plan_id,
        session_id: sessionId,
        shown_at: new Date().toISOString(),
        client_cohort_at_shown: invitation.cohortAtShown,
        event_seq_at_shown: invitation.eventSeqAtShown,
        options_shown: options.map((o) => o.id),
      };
    }
    const sentKey = sessionKey(
      sessionId,
      `exposure:${exposure.current.exposure_id}`,
    );
    if (sessionStorage.getItem(sentKey)) return;
    sessionStorage.setItem(askedKey(sessionId), "1");
    sessionStorage.setItem(sentKey, "1");
    const payload = JSON.stringify(exposure.current);
    // StrictMode replays this effect. sentKey guarantees one beacon per exposure.
    let queued = false;
    try {
      queued = navigator.sendBeacon(
        "/api/probe/exposure",
        new Blob([payload], { type: "application/json" }),
      );
    } catch {
      /* Older browsers use the same-origin keepalive fallback. */
    }
    if (!queued) {
      void fetch("/api/probe/exposure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [
    invitation.cohortAtShown,
    invitation.eventSeqAtShown,
    options,
    plan.plan_id,
    plan.ends_at,
    plan.closed_hint,
    sessionId,
    onClose,
  ]);

  async function submit(skip: boolean) {
    if (!exposure.current) return;
    setError("");
    const base = {
      exposure_id: exposure.current.exposure_id,
      responded_at: new Date().toISOString(),
      plan_id: exposure.current.plan_id,
      session_id: exposure.current.session_id,
      shown_at: exposure.current.shown_at,
      event_seq_at_shown: exposure.current.event_seq_at_shown,
      options_shown: exposure.current.options_shown,
    };
    if (skip) {
      // Skip never holds the user in the card; failure is nonresponse, not an answer.
      onClose();
      // An answer already attempted keeps its identity; dismissal cannot rewrite it.
      if (!submittedResponse.current) {
        submittedResponse.current = { ...base, skipped: true };
        void sendResponse(submittedResponse.current).catch(() => undefined);
      }
      return;
    }
    if (sending) return;
    if (!selected.length) return;
    submittedResponse.current ??= { ...base, option_ids: selected };
    setSending(true);
    try {
      await sendResponse(submittedResponse.current);
      onClose();
    } catch {
      setError("Your answer could not be sent. Try again or skip.");
      setSending(false);
    }
  }

  if (
    !exposure.current &&
    (Date.now() >= Date.parse(plan.ends_at) || plan.closed_hint)
  )
    return null;

  return (
    <aside
      className="probe-card"
      aria-labelledby="probe-title"
      aria-live="polite"
    >
      <div className="probe-top">
        <span>One optional question</span>
        <button
          className="icon-button"
          aria-label="Dismiss question"
          onClick={() => void submit(true)}
        >
          ×
        </button>
      </div>
      <h2 id="probe-title">{plan.stem}</h2>
      <p className="muted">Choose any that apply. Your answer is optional.</p>
      <fieldset disabled={sending || submittedResponse.current !== null}>
        <legend className="sr-only">Reasons</legend>
        {options.map((option) => (
          <label className="probe-option" key={option.id}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={(event) => {
                setSelected((current) =>
                  event.target.checked
                    ? [...current, option.id]
                    : current.filter((id) => id !== option.id),
                );
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          className="button primary"
          disabled={!selected.length || sending}
          onClick={() => void submit(false)}
        >
          {sending ? "Sending…" : "Send answer"}
        </button>
        <button className="button text" onClick={() => void submit(true)}>
          Skip
        </button>
      </div>
    </aside>
  );
}
