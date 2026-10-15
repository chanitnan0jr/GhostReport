import { useEffect, useRef, useState } from "react";
import { PERSONAS, type Clip } from "./DemoClips";
import { Icon, type IconName } from "./homeIcons";

// "Watch the demo" (and similar links) start all four recordings at once.
const PLAY_EVENT = "ghostreport:play-demo";
export function playDemo() {
  window.dispatchEvent(new Event(PLAY_EVENT));
}

// What each scripted persona does, how its result is tinted, and where the
// thumbnail is cropped. The checklist itself always comes from the recording.
const CARDS: Record<
  string,
  {
    summary: string;
    result: string;
    tone: "green" | "red" | "blue" | "violet";
    icon: IconName;
    crop: string;
  }
> = {
  connect: {
    summary: "Completes the wallet connection and continues in the app.",
    result: "Successfully connected and continued",
    tone: "green",
    icon: "check",
    crop: "50% 44%",
  },
  reject: {
    summary: "Opens the wallet but rejects the connection request.",
    result: "Rejected, but no result recorded",
    tone: "red",
    icon: "cross",
    crop: "50% 74%",
  },
  "error-retry": {
    summary: "Hits a network error, then retries the connection.",
    result: "Encountered an error, then connected",
    tone: "blue",
    icon: "retry",
    crop: "50% 44%",
  },
  "not-now-answer": {
    summary:
      "Chooses “Not now” and answers an optional question before leaving.",
    result: "Answered an exit question",
    tone: "violet",
    icon: "answer",
    crop: "50% 82%",
  },
};

const LABELS: Record<string, string> = {
  project_viewed: "Viewed a project",
  apply_clicked: "Clicked Apply",
  wallet_gate_shown: "Saw the wallet gate",
  wallet_attempted: "Started connecting",
  wallet_connected: "Wallet connected",
  wallet_errored: "Network error",
  wallet_rejected: "Rejected the wallet",
  not_now_clicked: "Chose “Not now”",
  back_nav: "Went back to projects",
};
const OUTCOMES = new Set([
  "wallet_connected",
  "wallet_errored",
  "wallet_rejected",
]);

interface Step {
  t: number;
  label: string;
  kind: "event" | "error" | "gap" | "answer";
  title?: string;
}

// The server-received events in order. An attempt with no outcome event before
// the next attempt (or the end) gets a "No result recorded" marker: that is all
// the server can see when someone rejects the wallet.
export function steps(clip: Clip): Step[] {
  const items: Step[] = [];
  clip.events.forEach((event, index) => {
    items.push({
      t: event.t_ms,
      label: LABELS[event.event] ?? event.event,
      kind: event.event === "wallet_errored" ? "error" : "event",
      title: event.event,
    });
    if (event.event !== "wallet_attempted") return;
    const rest = clip.events.slice(index + 1);
    const next = rest.find(
      (e) => e.event === "wallet_attempted" || OUTCOMES.has(e.event),
    );
    if (!next || next.event === "wallet_attempted")
      items.push({
        t: rest[0]?.t_ms ?? event.t_ms,
        label: "No result recorded",
        kind: "gap",
        title: "No wallet_connected, wallet_errored or wallet_rejected event",
      });
  });
  const probe = clip.probe;
  if (probe?.responded_t_ms != null)
    items.push({
      t: probe.responded_t_ms,
      label:
        probe.status === "answered"
          ? "Answered the exit question"
          : "Skipped the exit question",
      kind: probe.status === "answered" ? "answer" : "event",
      title: probe.selected.join(", ") || undefined,
    });
  // Stable sort: a gap stays just before the event that revealed it.
  return items.sort((a, b) => a.t - b.t);
}

function SessionCard({ clip }: { clip: Clip }) {
  const card = CARDS[clip.persona];
  const title =
    PERSONAS.find(([persona]) => persona === clip.persona)?.[1] ?? clip.persona;
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef(0);
  // null: at rest, every recorded step shown; a number: playback time in ms.
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  function follow() {
    const v = video.current;
    if (!v) return;
    if (v.ended) {
      setNow(null);
      setPlaying(false);
      return;
    }
    setNow(v.currentTime * 1000);
    if (!v.paused) frame.current = requestAnimationFrame(follow);
    else setPlaying(false);
  }
  function play() {
    const v = video.current;
    if (!v) return;
    cancelAnimationFrame(frame.current);
    v.currentTime = 0;
    setNow(0);
    setFailed(false);
    setPlaying(true);
    v.play()
      .then(() => {
        frame.current = requestAnimationFrame(follow);
      })
      .catch(() => {
        setPlaying(false);
        setNow(null);
        setFailed(true);
      });
  }
  function toggle() {
    const v = video.current;
    if (v && playing) {
      v.pause();
      cancelAnimationFrame(frame.current);
      setPlaying(false);
    } else if (v && now !== null && now > 0 && !v.ended) {
      setPlaying(true);
      void v.play().then(() => {
        frame.current = requestAnimationFrame(follow);
      });
    } else play();
  }
  useEffect(() => {
    window.addEventListener(PLAY_EVENT, play);
    return () => {
      window.removeEventListener(PLAY_EVENT, play);
      cancelAnimationFrame(frame.current);
    };
    // play only reads refs and state setters.
  }, []);

  const list = steps(clip);
  return (
    <article className={`hm-session is-${card.tone}`}>
      <header>
        <span className="hm-session-title">
          <h3>{title}</h3>
          <code>{clip.session_id}</code>
        </span>
      </header>
      <div className="hm-session-body">
        <div className="hm-shot">
          <video
            ref={video}
            src={`/demo/${clip.video_url}`}
            poster={`/demo/${clip.persona}-poster.jpg`}
            style={{ objectPosition: card.crop }}
            aria-label={`${title}: recorded app screen`}
            muted
            playsInline
            preload="none"
            onEnded={() => {
              cancelAnimationFrame(frame.current);
              setNow(null);
              setPlaying(false);
            }}
          />
          <button
            type="button"
            className="hm-shot-play"
            aria-label={`${playing ? "Pause" : "Play"} recording: ${title}`}
            onClick={toggle}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
              </svg>
            ) : (
              <Icon name="play" />
            )}
          </button>
        </div>
        <div className="hm-session-log">
          <p>{card.summary}</p>
          <ol aria-label={`Events the server received for ${clip.session_id}`}>
            {list.map((step, i) => {
              const pending = now !== null && step.t > now;
              return (
                <li
                  key={i}
                  className={`is-${pending ? "pending" : step.kind}`}
                  title={step.title}
                >
                  <i aria-hidden="true" />
                  {step.label}
                  {pending && (
                    <span className="hm-visually-hidden">
                      {" "}
                      (not yet received)
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {failed && (
            <p className="hm-session-error" role="alert">
              This recording could not start. Try again.
            </p>
          )}
        </div>
      </div>
      <a className="hm-session-result" href="/report/#segments">
        <Icon name={card.icon} />
        <span>{card.result}</span>
        <Icon name="arrow" />
      </a>
    </article>
  );
}

export function HomeDemo() {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      PERSONAS.map(async ([persona]) => {
        const response = await fetch(`/demo/${persona}.json`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Missing recording: ${persona}`);
        return (await response.json()) as Clip;
      }),
    )
      .then(setClips)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Recordings unavailable",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <section id="demo" className="hm-demo" aria-labelledby="home-demo-title">
      <header className="hm-demo-head">
        <div>
          <span className="hm-pill">Demo</span>
          <h2 id="home-demo-title">Simulated user sessions</h2>
          <p>
            Each log shows the events the server received for that session, at
            the moment they arrived.
          </p>
        </div>
        <a href="/sandbox/">
          Generate your own sessions in the sandbox{" "}
          <span aria-hidden="true">→</span>
        </a>
      </header>
      {error ? (
        <p className="hm-session-error" role="alert">
          {error}. The recordings are added after the demo run is seeded.
        </p>
      ) : !clips ? (
        <p className="hm-loading" role="status">
          Loading recordings…
        </p>
      ) : (
        <div className="hm-sessions">
          {clips.map((clip) => (
            <SessionCard key={clip.persona} clip={clip} />
          ))}
        </div>
      )}
    </section>
  );
}
