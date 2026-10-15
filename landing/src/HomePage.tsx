import { HomeDemo } from "./HomeDemo";
import { useHomePopulation } from "./useHomePopulation";
import { REPO_URL } from "./content";
import { SiteHeader } from "./SiteHeader";

type IconName =
  | "code"
  | "lock"
  | "question"
  | "report"
  | "people"
  | "database"
  | "shield"
  | "github"
  | "cube";

// Stroke icons drawn on a 24px grid; colour comes from currentColor.
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  code: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" />
    </>
  ),
  question: (
    <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.2V15M12 18.5v.01" />
  ),
  report: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
  cube: (
    <>
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// Read clockwise: top-left, top-right, bottom-right, bottom-left.
const LOOP = [
  ["code", "1. Read the code", "Map the workflow and what it does not record."],
  ["lock", "2. Lock hypotheses", "Approved and digested before any answer."],
  [
    "question",
    "3. Ask at the exit",
    "One optional question, to the right people at the moment they leave.",
  ],
  ["report", "4. Report k of n", "Self-reports and recorded observations."],
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

function Mountains() {
  return (
    <img className="home-mountains" src="/images/hero-mountains.png" alt="" />
  );
}

export function HomePage() {
  const { population, unavailable } = useHomePopulation();
  const facts: [IconName, React.ReactNode][] = [
    ["code", "Real app code. Events recorded by the app."],
    [
      "people",
      population ? (
        <span>
          {population.seed} of {population.total} sessions are seed ·{" "}
          {population.visitor} of {population.total} sessions are visitors
          {population.test > 0 && (
            <>
              {" "}
              · {population.test} of {population.total} sessions are tests
            </>
          )}
        </span>
      ) : (
        <span>
          {unavailable
            ? "Session counts temporarily unavailable."
            : "Loading session counts…"}
        </span>
      ),
    ],
    [
      "database",
      import.meta.env.VITE_MOCK === "1"
        ? "Preview data · sample population."
        : "Session counts refresh from the live API.",
    ],
    ["shield", "Same app across Demo, Segments and Report."],
  ];
  return (
    <Shell>
      <main>
        <section className="home-hero-band">
          <div className="home-hero">
            <div className="home-hero-copy">
              <ul className="home-tags" aria-label="About GhostReport">
                <li>Open source</li>
                <li>Reads the code</li>
                <li>Finds what isn’t measured</li>
              </ul>
              <h1>
                Your users stop
                <br />
                at the wallet step.
              </h1>
              <p className="home-subhead">
                Your analytics shows <em>where</em>, <em>not why</em>.
              </p>
              <p className="gr-lead">
                GhostReport reads the code to find what isn’t measured, locks
                hypotheses before any answers, asks one optional question of the
                right people at the moment they leave, and reports “k of n
                respondents”. Answers stay separate from recorded observations.
              </p>
              <div className="gr-actions">
                <a className="gr-button" href="#demo">
                  Watch the demo ↓
                </a>
                <a className="gr-button-quiet" href="#how-it-works">
                  How it works
                </a>
              </div>
            </div>
            <div
              id="how-it-works"
              className="home-loop"
              aria-label="The GhostReport loop"
            >
              <svg
                className="home-loop-ring"
                viewBox="0 0 460 400"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="home-arrow"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M1 1l6 4-6 4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </marker>
                </defs>
                <path
                  d="M128 22 Q 230 -8 332 22"
                  markerEnd="url(#home-arrow)"
                />
                <path
                  d="M282 345 Q 230 372 178 345"
                  markerEnd="url(#home-arrow)"
                />
                <path d="M370 160 V 194" markerEnd="url(#home-arrow)" />
                <path d="M90 194 V 160" markerEnd="url(#home-arrow)" />
              </svg>
              <ol>
                {LOOP.map(([icon, title, text]) => (
                  <li className="home-loop-step" key={title}>
                    <span className="home-loop-icon">
                      <Icon name={icon} />
                    </span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </li>
                ))}
              </ol>
              <div className="home-loop-center" aria-hidden="true">
                <img
                  src="/images/ghostreport-mark.png"
                  width="60"
                  height="68"
                  alt=""
                />
                GhostReport
              </div>
            </div>
            <Mountains />
          </div>
        </section>

        <div className="gr-page home-page">
          <section className="gr-card home-target">
            <img
              className="home-target-art"
              src="/images/common-ground-dao.jpg"
              alt="DAO — decentralized autonomous organization"
            />
            <div className="home-target-body">
              <ul className="home-tags home-tags-plain">
                <li>Simulated wallet</li>
                <li>No real funds</li>
                <li>Open source</li>
              </ul>
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
                <a className="gr-button" href="#demo">
                  Watch simulated users ▷
                </a>
                <a className="gr-button-quiet" href="/try/">
                  Try it yourself →
                </a>
              </div>
            </div>
            <ul className="home-facts">
              {facts.map(([icon, text]) => (
                <li key={icon}>
                  <Icon name={icon} />
                  {text}
                </li>
              ))}
            </ul>
          </section>

          <HomeDemo seedCount={population?.seed ?? null} />

          <section className="home-more">
            <a className="gr-card" href="/ens/">
              <span className="home-more-icon home-more-github">
                <Icon name="github" />
              </span>
              <div>
                <h3>Tested on a repo we didn’t write →</h3>
                <p className="gr-muted">
                  ENS app, read-only at a pinned commit. Explore the workflow
                  and code references checked by hand.
                </p>
              </div>
            </a>
            <a className="gr-card" href="/install/">
              <span className="home-more-icon">
                <Icon name="cube" />
              </span>
              <div>
                <h3>Add it to your app in 3 steps →</h3>
                <p className="gr-muted">
                  One config file, <code>track()</code>, and one optional
                  question at the exit.
                </p>
              </div>
            </a>
          </section>
          <footer className="home-footer">
            <span>
              The wallet is simulated. No real wallet or funds. A network error
              may be simulated once.
            </span>
            <a href="/about/">About GhostReport →</a>
          </footer>
        </div>
      </main>
    </Shell>
  );
}
