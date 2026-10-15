import { useEffect, useState } from "react";
import { REPO_URL } from "./content";
import { SiteHeader } from "./SiteHeader";

interface Live {
  population: string;
  digest: string | null;
  lockedAt: string | null;
}

const LOOP = [
  ["⌘", "1. Read the code", "Map the workflow and what it does not record"],
  ["🔒", "2. Lock hypotheses", "Approved and digested before any answer"],
  ["？", "3. Ask at the exit", "One optional question, to the right people"],
  ["▤", "4. Report k of n", "Self-reports and observations, never a cause"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gr-site">
      <div className="gr-header-bar">
        <SiteHeader />
      </div>
      {children}
    </div>
  );
}

export function useLive(): { live: Live | null; error: string } {
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/report", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`report unavailable (${response.status})`);
        return response.json();
      })
      .then((report) =>
        setLive({
          population: report.current.population,
          digest: report.v1?.digest ?? null,
          lockedAt: report.v1?.data_cutoff ?? null,
        }),
      )
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "report unavailable",
          );
      });
    return () => controller.abort();
  }, []);
  return { live, error };
}

export function HomePage() {
  const { live, error } = useLive();
  return (
    <Shell>
      <main className="gr-page">
        <section className="home-hero">
          <div>
            <span className="gr-kicker">
              Open source · Reads the code · Finds what isn’t measured
            </span>
            <h1>Your users stop at the wallet step.</h1>
            <p>
              Your analytics shows <em>where</em>, not <em>why</em>.
            </p>
            <p className="gr-lead">
              GhostReport reads the code to find what isn’t measured, locks
              hypotheses before seeing any data, asks one optional question of
              the right people at the moment they leave, and reports “k of n
              respondents”. It never claims a cause.
            </p>
            <div className="gr-actions">
              <a className="gr-button" href="/seed/">
                Watch the demo →
              </a>
              <a className="gr-button-quiet" href="/about/">
                How it works
              </a>
            </div>
          </div>
          <div className="loop" aria-label="The GhostReport loop">
            {LOOP.map(([icon, title, text]) => (
              <div className="loop-step" key={title}>
                <span aria-hidden="true">{icon}</span>
                {title}
                <small>{text}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="home-row">
          <article className="gr-card home-target">
            <div className="home-target-art" aria-hidden="true">
              c.
            </div>
            <div>
              <h2>Common Ground DAO</h2>
              <p className="gr-muted">
                The app we investigate: a mock grant app with a simulated
                wallet, in{" "}
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  this repo
                </a>
                . No real wallet or funds.
              </p>
              <div className="gr-actions">
                <a className="gr-button-quiet" href="/seed/">
                  Watch simulated users
                </a>
                <a className="gr-button" href="/try/">
                  Try it yourself
                </a>
              </div>
            </div>
          </article>
          <article className="gr-card home-live" aria-live="polite">
            <h3>
              Live data <span className="gr-muted">(from /api/report)</span>
            </h3>
            {error ? (
              <p className="gr-error">Live data unavailable: {error}</p>
            ) : !live ? (
              <p className="gr-muted">Loading…</p>
            ) : (
              <dl>
                <div>
                  <dt>Population</dt>
                  <dd>{live.population}</dd>
                </div>
                <div>
                  <dt>v1 locked before the first question</dt>
                  <dd>
                    {live.digest ? (
                      <code title={live.digest}>
                        {live.digest.slice(0, 12)}…
                      </code>
                    ) : (
                      "not locked yet"
                    )}
                    {live.lockedAt && (
                      <div className="gr-muted">
                        {new Date(live.lockedAt).toLocaleString()}
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            )}
            <p>
              <a href="/report/">Open the report →</a>
            </p>
          </article>
        </section>

        <section className="home-more">
          <a className="gr-card" href="/ens/">
            <h3>Tested on a repo we didn’t write →</h3>
            <p className="gr-muted">
              ENS app, read-only at a pinned commit: the Connect button on the
              Pricing step is never recorded.
            </p>
          </a>
          <a className="gr-card" href="/install/">
            <h3>Add it to your app in 3 steps →</h3>
            <p className="gr-muted">
              One config file, <code>track()</code>, and one optional question
              at the exit.
            </p>
          </a>
        </section>
      </main>
    </Shell>
  );
}
