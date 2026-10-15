import { useCallback, useEffect, useRef, useState } from "react";
import { fetchReport } from "./api";
import type { Report } from "./types";

export function useReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!mounted.current || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const next = await fetchReport(
        AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
      );
      if (!controller.signal.aborted && mounted.current) {
        setReport(next);
        setUpdatedAt(new Date().toISOString());
        setError("");
      }
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Report refresh unavailable",
        );
      }
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [refresh]);
  return { report, error, updatedAt, refresh };
}
