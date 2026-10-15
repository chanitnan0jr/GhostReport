import { useEffect, useRef, useState } from "react";
import { marks, type Clip } from "./DemoClips";

const RECORDINGS = [
  ["connect", "Connects", "found"],
  ["reject", "Rejects", "gap"],
  ["error-retry", "Error then retry", "stalled"],
  ["not-now-answer", "Not now then answers", "browsers"],
] as const;
const SEGMENTS: Record<string, string> = {
  connected: "Connected",
  attempted_no_success: "Stopped at the wallet",
  gate_event_no_attempt: "Stopped at the wallet",
  no_gate_event: "Browsers",
};

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function Recording({
  persona,
  title,
  tone,
  index,
}: {
  persona: string;
  title: string;
  tone: string;
  index: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/demo/${persona}.json`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Recording details unavailable.");
        const data = (await response.json()) as Clip;
        if (
          data.persona !== persona ||
          data.label !== "Simulated users (Playwright) — seed" ||
          !Array.isArray(data.events) ||
          !/^[a-z-]+\.webm$/.test(data.video_url)
        )
          throw new Error("Recording details unavailable.");
        if (!controller.signal.aborted) setClip(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Recording details unavailable.");
      });
    return () => controller.abort();
  }, [persona]);

  async function play() {
    if (!video.current) return;
    try {
      if (!started || video.current.ended) video.current.currentTime = 0;
      await video.current.play();
      setStarted(true);
    } catch {
      setError("Playback could not start. Please try again.");
    }
  }
  const items = clip ? marks(clip) : [];
  return (
    <article className="home-clip">
      <h3>
        <span className={`home-clip-number home-tone-${tone}`}>{index}</span>
        {title}
      </h3>
      <div className="home-clip-frame">
        {clip && (
          <video
            ref={video}
            src={`/demo/${clip.video_url}`}
            poster={`/demo/${persona}-poster.jpg`}
            aria-label={`${title}: recorded app screen`}
            muted
            playsInline
            preload="metadata"
            controls={started}
            onLoadedMetadata={(event) => {
              const value = event.currentTarget.duration;
              if (Number.isFinite(value)) {
                setDuration(value);
              }
            }}
            onTimeUpdate={(event) =>
              setNow(event.currentTarget.currentTime * 1000)
            }
            onPlay={() => {
              setPlaying(true);
              setError("");
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setError("This recording is unavailable.")}
          />
        )}
        {clip && !playing && !started && !error && (
          <button
            className="home-clip-play"
            aria-label={`Play: ${title}`}
            onClick={() => void play()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6.5v11l9-5.5z" fill="currentColor" />
            </svg>
          </button>
        )}
        {!clip && !error && (
          <span className="home-clip-loading" role="status">
            Loading recording…
          </span>
        )}
        {error && (
          <div className="home-clip-error" role="status">
            {error}
            {clip && (
              <button
                onClick={() => {
                  setError("");
                  void play();
                }}
              >
                Retry playback
              </button>
            )}
          </div>
        )}
        {!started && duration !== null && (
          <span className="home-clip-time">{durationLabel(duration)}</span>
        )}
      </div>
      {clip && (
        <details className="home-recording-log">
          <summary>
            Recorded events <span aria-hidden="true">↗</span>
          </summary>
          <p className="home-recording-segment">
            {SEGMENTS[clip.cohort] ?? clip.cohort}
          </p>
          <ol>
            {items.map((item, index) => (
              <li key={index} data-reached={started && item.t <= now}>
                <time>{(item.t / 1000).toFixed(1)}s</time>
                <span>
                  {item.detail ? <code>{item.detail}</code> : item.text}
                </span>
              </li>
            ))}
          </ol>
          <p>
            Recorded session: <code>{clip.session_id}</code>. Question records
            are separate from app events.
          </p>
        </details>
      )}
    </article>
  );
}

export function HomeDemo({ seedCount }: { seedCount: number | null }) {
  return (
    <section
      id="demo"
      className="gr-card home-demo"
      aria-label="Demo recordings"
    >
      <header>
        <span className="home-demo-label">DEMO</span>
        <span className="gr-muted">Simulated users (Playwright) — seed</span>
        <a href="/seed/">
          {seedCount === null
            ? "See recorded sessions"
            : `See ${seedCount} of ${seedCount} seed sessions`}{" "}
          →
        </a>
      </header>
      <div className="home-clips">
        {RECORDINGS.map(([persona, title, tone], index) => (
          <Recording
            key={persona}
            persona={persona}
            title={title}
            tone={tone}
            index={index + 1}
          />
        ))}
      </div>
    </section>
  );
}
