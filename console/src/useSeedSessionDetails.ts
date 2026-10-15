import { useEffect, useState } from "react";
import type { Cohort, Session } from "./types";

export interface SeedSessionDetail {
  session_id: string;
  source: "seed";
  cohort: Cohort;
  exit_type: Session["exit_type"];
  coverage: Session["coverage"];
  after_retry: boolean;
  events: {
    seq: number;
    event: string;
    page: string;
    occurred_at: string;
    received_at: string | null;
  }[];
  probe: null | {
    decision_point: string;
    after_seq: number;
    status: "answered" | "skipped" | "shown_no_response";
    selected: string[];
    shown_received_at: string | null;
    responded_received_at: string | null;
  };
}
export function useSeedSessionDetails(runId: string, ids: string[]) {
  const [cache, setCache] = useState<Record<string, SeedSessionDetail | null>>(
    {},
  );
  const key = JSON.stringify(ids);
  useEffect(() => {
    const requested: string[] = JSON.parse(key);
    if (!requested.length) return;
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      let cursor = 0;
      async function worker() {
        while (cursor < requested.length && !controller.signal.aborted) {
          const sid = requested[cursor++];
          try {
            const response = await fetch(
              `/api/seed-sessions/${encodeURIComponent(sid)}`,
              {
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(5000),
                ]),
              },
            );
            if (!response.ok) throw new Error("Unavailable");
            const value: SeedSessionDetail = await response.json();
            if (
              !value ||
              value.session_id !== sid ||
              value.source !== "seed" ||
              !Array.isArray(value.events) ||
              value.events.some(
                (e) =>
                  !e ||
                  typeof e.event !== "string" ||
                  typeof e.page !== "string" ||
                  typeof e.occurred_at !== "string" ||
                  !(
                    e.received_at === null || typeof e.received_at === "string"
                  ) ||
                  !Number.isInteger(e.seq),
              ) ||
              new Set(value.events.map((e) => e.seq)).size !==
                value.events.length ||
              (value.probe !== null &&
                (!value.probe ||
                  !["DP1", "DP2"].includes(value.probe.decision_point) ||
                  !["answered", "skipped", "shown_no_response"].includes(
                    value.probe.status,
                  ) ||
                  !Number.isInteger(value.probe.after_seq) ||
                  !Array.isArray(value.probe.selected) ||
                  value.probe.selected.some(
                    (label) => typeof label !== "string",
                  ) ||
                  ![
                    value.probe.shown_received_at,
                    value.probe.responded_received_at,
                  ].every((t) => t === null || typeof t === "string")))
            )
              throw new Error("Unexpected session log");
            if (!controller.signal.aborted)
              setCache((current) => ({
                ...current,
                [`${runId}:${sid}`]: value,
              }));
          } catch {
            if (!controller.signal.aborted)
              setCache((current) => ({
                ...current,
                [`${runId}:${sid}`]: null,
              }));
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(4, requested.length) }, () => worker()),
      );
      busy = false;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [runId, key]);
  return (sid: string) => cache[`${runId}:${sid}`];
}
