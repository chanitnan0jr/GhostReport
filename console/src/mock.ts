import sample from "../../fixtures/report.sample.json";
import document from "../../fixtures/report.document.sample.json";
import type { Report } from "./types";
import { mockJourneys, mockWorkflow } from "./mockViews";
import type { JourneySource } from "./journeys";
import { mockEvidence } from "./mockEvidence";

/** The shared report fixture is read directly; it is never rewritten. */
export function installMockBackend() {
  const state = structuredClone(sample) as Report;
  state.current.sources = {
    seed: state.current.sessions.length,
    test: 0,
    visitor: 0,
  };
  state.current.population = `seed ${state.current.sessions.length} + visitors 0`;
  state.current.session_sources = Object.fromEntries(
    state.current.sessions.map((session) => [session.session_id, "seed"]),
  );
  state.current.findings = state.current.findings.map((finding) => ({
    ...finding,
    by_source: {
      seed: { selected: finding.selected, respondents: finding.respondents },
      test: { selected: 0, respondents: 0 },
      visitor: { selected: 0, respondents: 0 },
    },
    text: `${finding.selected} of ${finding.respondents} respondents${finding.respondents ? ` (seed ${finding.selected} of ${finding.respondents})` : ""}`,
  }));
  state.narrative = {
    source: "template",
    text: `Population: ${state.current.population} sessions. These are simulated sessions for a report preview. ${state.current.findings[0]?.text ?? "0 of 0 respondents"}. Self-report and observed behavior remain separate.`,
    facts: {
      population: state.current.population,
      sources: state.current.sources,
      findings: state.current.findings,
    },
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      location.origin,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return nativeFetch(input, init);
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/api/report") return json(state);
    if (url.pathname === "/api/report/document") return json(document);
    if (url.pathname === "/api/evidence") return json(mockEvidence(state));
    if (url.pathname.startsWith("/api/journeys/session/")) {
      const sid = decodeURIComponent(
        url.pathname.slice("/api/journeys/session/".length),
      );
      const session = state.current.sessions.find(
        (item) => item.session_id === sid,
      );
      if (!session) return json({ detail: "no such session in this run" }, 404);
      const graph = mockJourneys({
        ...state,
        current: { ...state.current, sessions: [session] },
      });
      const segment = graph.segments.find((item) => item.sessions === 1)!;
      return json({
        source: "seed",
        segment: segment.segment,
        segment_label: segment.label,
        nodes: graph.nodes.map((node) => node.id),
        edges: graph.edges.map(({ source, target }) => ({ source, target })),
        probe: null,
      });
    }
    if (url.pathname === "/api/journeys")
      return json(
        mockJourneys(
          state,
          (url.searchParams.get("source") ?? undefined) as
            JourneySource | undefined,
        ),
      );
    if (url.pathname === "/api/workflow")
      return json(
        mockWorkflow(
          state,
          url.searchParams.get("target") === "ens" ? "ens" : "app",
        ),
      );
    if (url.pathname === "/api/lock" && init?.method === "POST") {
      if (!state.v1)
        return json(
          { detail: "Sample does not contain a baseline digest" },
          409,
        );
      state.locked = true;
      return json({
        version: 1,
        digest: state.v1.digest,
        data_cutoff: state.v1.data_cutoff,
      });
    }
    if (url.pathname === "/api/snapshot" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { v1_digest?: string };
      if (!state.v1 || body.v1_digest !== state.v1.digest)
        return json(
          { detail: "External v1 digest does not match the locked baseline" },
          409,
        );
      const snapshot = {
        version: (state.snapshots.at(-1)?.version ?? 1) + 1,
        digest: [...crypto.getRandomValues(new Uint8Array(32))]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
        data_cutoff: state.current.data_cutoff,
      };
      state.snapshots.push(snapshot);
      return json(snapshot);
    }
    return json({ detail: "Unknown mock endpoint" }, 404);
  };
  return () => {
    window.fetch = nativeFetch;
  };
}
