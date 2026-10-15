import { useEffect, useState } from "react";
import type { JourneySource, JourneySegment } from "./journeys";
import { apiUrl } from "./api";

export interface SessionJourney {
  source: JourneySource;
  segment: JourneySegment["segment"];
  segment_label: string;
  nodes: string[];
  edges: { source: string; target: string }[];
  probe: "answered" | "skipped" | "shown_no_response" | null;
}

export function validateSessionJourney(value: SessionJourney): void {
  if (
    !value ||
    !["seed", "test", "visitor"].includes(value.source) ||
    !["browsers", "stalled_at_wallet", "connected"].includes(value.segment) ||
    typeof value.segment_label !== "string" ||
    !Array.isArray(value.nodes) ||
    value.nodes.some((id) => typeof id !== "string") ||
    new Set(value.nodes).size !== value.nodes.length ||
    !Array.isArray(value.edges) ||
    value.edges.some(
      (edge) =>
        !edge ||
        !value.nodes.includes(edge.source) ||
        !value.nodes.includes(edge.target),
    ) ||
    !["answered", "skipped", "shown_no_response", null].includes(value.probe)
  ) {
    throw new Error("Unexpected session journey response");
  }
}

export function useSessionJourney(sid: string | null) {
  const [result, setResult] = useState<{
    sid: string;
    value: SessionJourney | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!sid) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(
          apiUrl(`/api/journeys/session/${encodeURIComponent(sid!)}`),
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(5000),
            ]),
          },
        );
        if (response.status === 404) {
          if (!controller.signal.aborted)
            setResult({ sid: sid!, value: null, error: "" });
          return;
        }
        if (!response.ok)
          throw new Error("Your session path is temporarily unavailable.");
        const value: SessionJourney = await response.json();
        validateSessionJourney(value);
        if (!controller.signal.aborted)
          setResult({ sid: sid!, value, error: "" });
      } catch {
        if (!controller.signal.aborted)
          setResult({
            sid: sid!,
            value: null,
            error:
              "Your session path is temporarily unavailable. Retrying automatically.",
          });
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void refresh(), 3000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sid]);
  return result?.sid === sid ? result : null;
}
