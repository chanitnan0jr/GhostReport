import { getSessionId, sessionKey, uuid } from "./session";
import type { CanonicalEvent, Cohort, EventName, Page } from "./types";

interface TrackingState {
  seq: number;
  pending: CanonicalEvent[];
  once: string[];
  attempted: boolean;
  gateSeen: boolean;
  connected: boolean;
}

interface TrackerOptions {
  sessionId: string;
  storage?: Storage;
  fetch?: typeof fetch;
  beacon?: (url: string, data: Blob) => boolean;
  autoFlush?: boolean;
}

export function validateProps(
  props: Record<string, unknown>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      !["project_id", "page"].includes(key) ||
      typeof value !== "string" ||
      /0x[\da-f]{40}/i.test(value)
    ) {
      throw new Error(`Disallowed analytics property: ${key}`);
    }
    // Values are controlled IDs/page names. Never accept user-entered text here.
    if (key === "project_id" && !/^p\d{1,6}$/.test(value)) {
      throw new Error("Invalid project identifier");
    }
    if (
      key === "page" &&
      ![
        "ProjectList",
        "ProjectPage",
        "ApplyModal",
        "MockWalletPopup",
        "ApplicationForm",
      ].includes(value)
    ) {
      throw new Error("Invalid analytics page");
    }
    clean[key] = value;
  }
  return clean;
}

export function createTracker(options: TrackerOptions) {
  const storage = options.storage ?? sessionStorage;
  const key = sessionKey(options.sessionId, "tracking-v1");
  const saved = storage.getItem(key);
  const state: TrackingState = saved
    ? JSON.parse(saved)
    : {
        seq: 0,
        pending: [],
        once: [],
        attempted: false,
        gateSeen: false,
        connected: false,
      };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  const save = () => storage.setItem(key, JSON.stringify(state));
  const schedule = (delay = 250) => {
    if (options.autoFlush === false || stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };

  function track(
    event: EventName,
    page: Page,
    props: Record<string, unknown> = {},
    attempt_id: string | null = null,
  ): CanonicalEvent {
    const clean = validateProps(props);
    if (
      [
        "wallet_attempted",
        "wallet_connected",
        "wallet_rejected",
        "wallet_errored",
      ].includes(event) !==
      (attempt_id !== null)
    )
      throw new Error("Invalid attempt attribution");
    const item: CanonicalEvent = {
      event_id: uuid(),
      session_id: options.sessionId,
      seq: state.seq + 1,
      attempt_id,
      event,
      occurred_at: new Date().toISOString(),
      page,
      schema_version: 1,
      props: clean,
    };
    state.seq = item.seq;
    state.pending.push(item);
    if (event === "wallet_attempted") state.attempted = true;
    if (event === "wallet_gate_shown") state.gateSeen = true;
    if (event === "wallet_connected") state.connected = true;
    save();
    schedule();
    return item;
  }

  function trackOnce(
    displayId: string,
    event: EventName,
    page: Page,
    props: Record<string, unknown> = {},
  ): void {
    if (state.once.includes(displayId)) return;
    track(event, page, props);
    state.once.push(displayId);
    save();
  }

  async function flush(): Promise<void> {
    if (inFlight || state.pending.length === 0 || stopped) return;
    inFlight = true;
    const batch = state.pending.slice(0, 30);
    try {
      const response = await (options.fetch ?? window.fetch.bind(window))(
        "/api/events",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok) throw new Error("Event ingest unavailable");
      const sent = new Set(batch.map((event) => event.event_id));
      state.pending = state.pending.filter(
        (event) => !sent.has(event.event_id),
      );
      failures = 0;
      save();
    } catch {
      failures += 1;
    } finally {
      inFlight = false;
      if (state.pending.length)
        schedule(Math.min(30_000, 500 * 2 ** Math.min(failures, 6)));
    }
  }

  function pagehide(): void {
    // Keep the outbox after a beacon: receipt is best-effort, IDs dedupe on retry.
    for (let offset = 0; offset < state.pending.length; offset += 20) {
      const body = new Blob(
        [JSON.stringify({ events: state.pending.slice(offset, offset + 20) })],
        {
          type: "application/json",
        },
      );
      try {
        const send = options.beacon ?? navigator.sendBeacon.bind(navigator);
        if (!send("/api/events", body)) break;
      } catch {
        break;
      }
    }
  }

  const online = () => {
    void flush();
  };
  function start(): () => void {
    stopped = false;
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("online", online);
    if (state.pending.length) schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("online", online);
    };
  }

  function cohort(): Cohort {
    if (state.connected) return "connected";
    if (state.attempted) return "attempted_no_success";
    return state.gateSeen ? "gate_event_no_attempt" : "no_gate_event";
  }

  return {
    track,
    trackOnce,
    flush,
    pagehide,
    start,
    cohort,
    sessionId: options.sessionId,
    sequence: () => state.seq,
    hasAttempted: () => state.attempted,
    pending: () => [...state.pending],
  };
}

export type Tracker = ReturnType<typeof createTracker>;
let instance: Tracker | undefined;
export function getTracker(): Tracker {
  return (instance ??= createTracker({ sessionId: getSessionId() }));
}

export function track(
  event: EventName,
  page: Page,
  props: Record<string, unknown> = {},
  attempt_id: string | null = null,
): CanonicalEvent {
  return getTracker().track(event, page, props, attempt_id);
}
