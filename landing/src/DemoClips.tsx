import { useEffect, useRef, useState } from "react";

// Recorded Playwright personas: a clip plus the server-received events of that same
// session, timed to the clip (scripts/seed writes both). Nothing here runs a browser.
export interface Clip {
  session_id: string;
  persona: string;
  label: string;
  video_url: string;
  events: { t_ms: number; event: string; seq: number }[];
  cohort: string;
  exit_type: string;
  after_retry: boolean;
  probe: null | {
    decision_point: string;
    status: string;
    selected: string[];
    shown_t_ms: number | null;
    responded_t_ms: number | null;
  };
}

export const PERSONAS = [
  ["connect", "Connects a wallet"],
  ["reject", "Rejects the wallet"],
  ["error-retry", "Network error, then retry"],
  ["not-now-answer", "Not now, then answers"],
] as const;

const EVENT_LABELS: Record<string, string> = {
  project_viewed: "Viewed a project",
  apply_clicked: "Clicked Apply",
  wallet_gate_shown: "Wallet gate shown",
  wallet_attempted: "Started connecting",
  wallet_connected: "Wallet connected",
  wallet_errored: "Network error (simulated)",
  not_now_clicked: "Chose Not now",
  back_nav: "Back to projects",
};
const COHORTS: Record<string, string> = {
  connected: "Connected",
  attempted_no_success: "Stopped at the wallet",
  gate_event_no_attempt: "Stopped at the wallet",
  no_gate_event: "Browsers",
};
const PROBE_STATUS: Record<string, string> = {
  answered: "answered",
  skipped: "skipped",
  shown_no_response: "shown, no response",
};

interface Mark {
  t: number;
  text: string;
  kind: "event" | "probe";
  detail?: string;
}

export function marks(clip: Clip): Mark[] {
  const items: Mark[] = clip.events.map((e) => ({
    t: e.t_ms,
    text: EVENT_LABELS[e.event] ?? e.event,
    kind: "event",
    detail: `#${e.seq} ${e.event}`,
  }));
  const probe = clip.probe;
  if (probe?.shown_t_ms != null)
    items.push({
      t: probe.shown_t_ms,
      text: `Question shown (${probe.decision_point})`,
      kind: "probe",
    });
  if (probe?.responded_t_ms != null)
    items.push({
      t: probe.responded_t_ms,
      text:
        probe.status === "answered"
          ? `Answered: ${probe.selected.join(", ")}`
          : "Skipped the question",
      kind: "probe",
    });
  return items.sort((a, b) => a.t - b.t);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function ClipCard({
  title,
  clip,
  now,
  register,
}: {
  title: string;
  clip: Clip;
  now: number;
  register: (video: HTMLVideoElement | null) => void;
}) {
  const items = marks(clip);
  const shown = items.filter((m) => m.t <= now);
  const last = items.length ? items[items.length - 1].t : 0;
  const done = now >= last + 400;
  const probe = clip.probe;
  return (
    <article className="clip-card">
      <header>
        <h3>{title}</h3>
        <code>{clip.session_id}</code>
      </header>
      <div className="clip-video">
        <video
          ref={register}
          src={`/demo/${clip.video_url}`}
          poster={`/demo/${clip.persona}-poster.jpg`}
          aria-label={`${title}: recorded app screen`}
          muted
          playsInline
          preload="auto"
        />
      </div>
      <ol className="clip-log" aria-live="polite">
        {shown.map((mark, index) => (
          <li key={index} className={`clip-${mark.kind}`}>
            <time>{seconds(mark.t)}</time>
            <span>{mark.text}</span>
          </li>
        ))}
        {!shown.length && <li className="clip-waiting">Waiting for events…</li>}
      </ol>
      <footer className={done ? "clip-result clip-result-done" : "clip-result"}>
        {done ? (
          <>
            <strong>{COHORTS[clip.cohort] ?? clip.cohort}</strong>
            <span>
              {probe
                ? `Question ${probe.decision_point}: ${PROBE_STATUS[probe.status] ?? probe.status}`
                : "Not asked"}
              {clip.after_retry ? " · connected after a retry" : ""}
            </span>
          </>
        ) : (
          <span>Segment appears when the session ends</span>
        )}
      </footer>
    </article>
  );
}

export function DemoClips() {
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const videos = useRef<Record<string, HTMLVideoElement | null>>({});
  const frame = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      PERSONAS.map(async ([persona]) => {
        const response = await fetch(`/demo/${persona}.json`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Missing recording: ${persona}`);
        return [persona, (await response.json()) as Clip] as const;
      }),
    )
      .then((entries) => setClips(Object.fromEntries(entries)))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Recordings unavailable.",
          );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function tick() {
    const all = Object.values(videos.current).filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    // Re-render every frame; each card reads its own video's time.
    setNow(Math.max(0, ...all.map((v) => v.currentTime * 1000)));
    if (all.some((v) => !v.paused && !v.ended))
      frame.current = requestAnimationFrame(tick);
    else setPlaying(false);
  }

  function playAll() {
    cancelAnimationFrame(frame.current);
    const all = Object.values(videos.current).filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    for (const video of all) video.currentTime = 0;
    setNow(0);
    setPlaying(true);
    setPlaybackError("");
    void Promise.allSettled(all.map((v) => v.play())).then((results) => {
      if (results.some((result) => result.status === "rejected"))
        setPlaybackError(
          "Some recordings could not start. Please try Play all four again.",
        );
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(tick);
    });
  }

  if (error)
    return (
      <div role="alert" className="seed-error">
        {error}. The recordings are added after the demo run is seeded.
      </div>
    );
  if (Object.keys(clips).length < PERSONAS.length)
    return <p role="status">Loading recordings…</p>;

  return (
    <section className="clips" aria-label="Recorded simulated users">
      <div className="clips-bar">
        <button className="clips-play" onClick={playAll} disabled={playing}>
          {playing
            ? "Playing…"
            : now > 0
              ? "Replay all four"
              : "▶ Play all four"}
        </button>
        <span>
          Each log shows the events the server received for that session, at the
          moment they arrived.
        </span>
      </div>
      {playbackError && (
        <p className="seed-error" role="alert">
          {playbackError}
        </p>
      )}
      <div className="clips-grid">
        {PERSONAS.map(([persona, title]) => (
          <ClipCard
            key={persona}
            title={title}
            clip={clips[persona]}
            now={(videos.current[persona]?.currentTime ?? 0) * 1000}
            register={(video) => {
              videos.current[persona] = video;
            }}
          />
        ))}
      </div>
    </section>
  );
}
