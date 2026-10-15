import type {
  CanonicalEvent,
  ProbeExposure,
  ProbePlan,
  ProbeResponse,
} from "../types";

export interface MockState {
  events: (CanonicalEvent & { received_at: string })[];
  exposures: ProbeExposure[];
  responses: ProbeResponse[];
  planRequests: string[];
  failEvents: boolean;
}

declare global {
  interface Window {
    __GHOST_MOCK__?: MockState;
  }
}

function makePlan(decisionPoint: string): ProbePlan {
  const dp2 = decisionPoint === "DP2";
  return {
    plan_id: dp2 ? "mock-plan-dp2" : "mock-plan-dp1",
    question_version: "mock-v1",
    decision_point: dp2 ? "DP2" : "DP1",
    target_cohort: dp2 ? "no_gate_event" : "gate_event_no_attempt",
    stem: dp2
      ? "What were you hoping to do on this page?"
      : "What best describes your decision not to connect right now?",
    options: dp2
      ? [
          { id: "browse", label: "Explore projects" },
          { id: "apply", label: "Find a grant to apply for" },
          { id: "compare", label: "Compare funding options" },
          { id: "other", label: "Something else" },
        ]
      : [
          { id: "unaware", label: "Didn't know I needed a wallet" },
          { id: "permission", label: "Concerned about the permissions" },
          { id: "browsing", label: "Just browsing" },
          { id: "requester", label: "Not sure who is asking" },
          { id: "other", label: "Something else" },
        ],
    ends_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    closed_hint: false,
  };
}

/** Intercepts same-origin /api calls, including sendBeacon, only in VITE_MOCK=1. */
export function installMockBackend(): () => void {
  const state: MockState = {
    events: [],
    exposures: [],
    responses: [],
    planRequests: [],
    failEvents: false,
  };
  window.__GHOST_MOCK__ = state;
  const realFetch = window.fetch.bind(window);
  const realBeacon = navigator.sendBeacon?.bind(navigator);
  const eventIds = new Set<string>();
  const plans = [makePlan("DP1"), makePlan("DP2")];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  function handle(url: URL, method: string, body: string): Response | null {
    if (url.origin !== location.origin) return null;
    if (url.pathname === "/api/probe-plan" && method === "GET") {
      const point = url.searchParams.get("decision_point") ?? "DP1";
      state.planRequests.push(point);
      return json(plans.find((plan) => plan.decision_point === point) ?? null);
    }
    if (url.pathname === "/api/events" && method === "POST") {
      if (state.failEvents)
        return json({ detail: "Simulated offline ingest" }, 503);
      const input = JSON.parse(body) as { events: CanonicalEvent[] };
      for (const event of input.events) {
        if (eventIds.has(event.event_id)) continue;
        eventIds.add(event.event_id);
        state.events.push({ ...event, received_at: new Date().toISOString() });
      }
      return json({ accepted: input.events.length });
    }
    if (url.pathname === "/api/probe/exposure" && method === "POST") {
      const exposure = JSON.parse(body) as ProbeExposure;
      if (!state.exposures.some((e) => e.exposure_id === exposure.exposure_id))
        state.exposures.push(exposure);
      return json({ accepted: true });
    }
    if (url.pathname === "/api/probe/response" && method === "POST") {
      const response = JSON.parse(body) as ProbeResponse;
      if (
        !state.exposures.some((e) => e.exposure_id === response.exposure_id)
      ) {
        const plan = plans.find((p) => p.plan_id === response.plan_id);
        if (!plan) return json({ detail: "Unknown plan" }, 422);
        state.exposures.push({
          exposure_id: response.exposure_id,
          plan_id: response.plan_id,
          session_id: response.session_id,
          shown_at: response.shown_at,
          event_seq_at_shown: response.event_seq_at_shown,
          options_shown: response.options_shown,
          client_cohort_at_shown: plan.target_cohort,
        });
      }
      if (!state.responses.some((r) => r.exposure_id === response.exposure_id))
        state.responses.push(response);
      return json({ accepted: true });
    }
    return null;
  }

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? input.toString(), location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return realFetch(input, init);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const body =
      typeof init?.body === "string"
        ? init.body
        : request
          ? await request.text()
          : "";
    return (
      handle(url, init?.method ?? request?.method ?? "GET", body) ??
      json({ detail: "Unknown mock route" }, 404)
    );
  };
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (url: string, data?: BodyInit | null) => {
      const target = new URL(url, location.origin);
      if (
        target.origin !== location.origin ||
        !target.pathname.startsWith("/api/")
      ) {
        return realBeacon?.(url, data) ?? false;
      }
      const body =
        data instanceof Blob
          ? data.text()
          : Promise.resolve(String(data ?? ""));
      void body.then((text) => handle(target, "POST", text));
      return true;
    },
  });
  return () => {
    window.fetch = realFetch;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: realBeacon,
    });
    delete window.__GHOST_MOCK__;
  };
}
