import { useEffect, useState } from "react";

export interface HomePopulation {
  total: number;
  seed: number;
  visitor: number;
  test: number;
}

export function useHomePopulation() {
  const [population, setPopulation] = useState<HomePopulation | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/report", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Report unavailable");
        const report = await response.json();
        const records = report.current?.sessions;
        const sources = report.current?.session_sources;
        if (!Array.isArray(records) || !sources)
          throw new Error("Sources unavailable");
        const counts: HomePopulation = {
          total: records.length,
          seed: 0,
          visitor: 0,
          test: 0,
        };
        const ids = new Set<string>();
        for (const session of records) {
          if (!session || typeof session.session_id !== "string")
            throw new Error("Invalid session");
          const source = sources[session.session_id];
          if (
            ids.has(session.session_id) ||
            !["seed", "visitor", "test"].includes(source)
          )
            throw new Error("Sources unavailable");
          ids.add(session.session_id);
          counts[source as "seed" | "visitor" | "test"]++;
        }
        if (!controller.signal.aborted) {
          setPopulation(counts);
          setUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPopulation(null);
          setUnavailable(true);
        }
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
  }, []);
  return { population, unavailable };
}
