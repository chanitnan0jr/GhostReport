import { HomeDemo } from "./HomeDemo";
import { useHomePopulation } from "./useHomePopulation";
import { REPO_URL } from "./content";
import { SiteHeader } from "./SiteHeader";
import "./home.css";

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

const STEPS = [
  ["code", "Read\nthe code"],
  ["lock", "Lock\nhypotheses"],
  ["question", "Ask at\nthe exit"],
  ["report", "Report\nk of n"],
] as const;

export function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`gr-site ${className}`.trim()}>
      <SiteHeader />
      {children}
    </div>
  );
}

export function HomePage() {
  const { population, unavailable } = useHomePopulation();
  return (
    <Shell className="home-site">
      <main className="ink-home">
        <section className="ink-hero" aria-labelledby="home-title">
          <div className="ink-hero-copy">
            <p className="home-eyebrow">Find the unmeasured</p>
            <h1 id="home-title">
              Your users stop at the wallet step.
              <br />
              Your analytics shows <em>where, not why.</em>
            </h1>
            <p className="ink-lead">
              GhostReport reads the code to find what isn’t measured, locks
              hypotheses before any answers, asks one optional question of the
              right people at the moment they leave, and reports “k of n
              respondents”. Answers stay separate from recorded observations.
            </p>
            <div className="ink-actions">
              <a className="ink-button" href="#demo">
                Watch the demo <span aria-hidden="true">→</span>
              </a>
              <a
                className="ink-button ink-button-secondary"
                href="#how-it-works"
              >
                How it works
              </a>
            </div>
          </div>
          <ol
            id="how-it-works"
            className="ink-process"
            aria-label="How GhostReport works"
          >
            {STEPS.map(([icon, title], index) => (
              <li className="ink-step" key={icon}>
                <span className="ink-step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="ink-step-icon">
                  <Icon name={icon} />
                </span>
                <span className="ink-step-title">{title}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="ink-feature" aria-labelledby="featured-app-title">
          <a
            href="/app/"
            className="ink-app-preview"
            aria-label="Try Common Ground DAO"
          >
            <img
              src="/images/common-ground-preview.png"
              alt="The real Common Ground DAO grant app: Good ideas. Common ground."
            />
          </a>
          <div className="ink-feature-copy">
            <img
              className="ink-dao-symbol"
              src="/images/common-ground-dao.jpg"
              alt="DAO"
            />
            <p className="home-eyebrow">Featured app</p>
            <h2 id="featured-app-title">Common Ground DAO</h2>
            <ul className="ink-tags">
              <li>
                <Icon name="database" />
                Simulated wallet
              </li>
              <li>
                <Icon name="shield" />
                No real funds
              </li>
              <li>
                <Icon name="github" />
                Open source
              </li>
            </ul>
            <p>
              The app we investigate: a mock grant app with a simulated wallet,
              in{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                this repo
              </a>
              . No real wallet or funds.
            </p>
            <p className="ink-population">
              {population ? (
                <>
                  {population.seed} of {population.total} sessions are seed ·{" "}
                  {population.visitor} of {population.total} sessions are
                  visitors
                  {population.test > 0 && (
                    <>
                      {" "}
                      · {population.test} of {population.total} sessions are
                      tests
                    </>
                  )}
                </>
              ) : unavailable ? (
                "Session counts temporarily unavailable."
              ) : (
                "Loading session counts…"
              )}
              {import.meta.env.VITE_MOCK === "1" && " · Preview data"}
            </p>
            <div className="ink-actions">
              <a className="ink-button" href="#demo">
                Watch simulated users <span aria-hidden="true">→</span>
              </a>
              <a className="ink-button ink-button-secondary" href="/app/">
                Try it yourself <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>
        <HomeDemo />
        <section className="ink-next-links" aria-label="Explore GhostReport">
          <a className="ink-next" href="/ens/">
            <span className="ink-next-icon">
              <Icon name="code" />
            </span>
            <div>
              <h2>Tested on a repo we didn’t write</h2>
              <p>
                ENS app, read-only at a pinned commit. Explore its workflow and
                code references checked by hand.
              </p>
            </div>
            <span className="ink-next-action">
              View details <span aria-hidden="true">→</span>
            </span>
          </a>
          <a className="ink-next" href="/install/">
            <span className="ink-next-icon">
              <Icon name="cube" />
            </span>
            <div>
              <h2>Add it to your app in 3 steps</h2>
              <p>
                One config file, <code>track()</code>, and one optional question
                at the exit.
              </p>
            </div>
            <span className="ink-next-action">
              See the steps <span aria-hidden="true">→</span>
            </span>
          </a>
        </section>
        <footer className="ink-footer">
          <span>
            The wallet is simulated. No real wallet or funds. A network error
            may be simulated once.
          </span>
          <a href="/about/">About GhostReport →</a>
        </footer>
      </main>
    </Shell>
  );
}
