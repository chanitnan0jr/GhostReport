import { HomeDemo, playDemo } from "./HomeDemo";
import { Icon, type IconName } from "./homeIcons";
import { REPO_URL } from "./content";
import { SiteHeader } from "./SiteHeader";
import "./home.css";

// The four stages, in order; each card sits on the trail in the hero art.
const STEPS: [IconName, string, string][] = [
  ["code", "Read the code", "Map the workflow and what it does not record."],
  ["lock", "Lock hypotheses", "Approved and digested before any answer."],
  [
    "question",
    "Ask at the exit",
    "One optional question, to the right people at the moment they leave.",
  ],
  ["report", "Report k of n", "Self-reports and recorded observations."],
];

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

function Trail() {
  return (
    <div className="hm-trail">
      {/* Drawn in the same 470 × 310 box the step cards are placed in. */}
      <svg
        className="hm-trail-path"
        viewBox="0 0 470 310"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M 120 27 L 162 27 C 205 27, 230 48, 223 78 C 216 108, 196 128, 202 156 C 207 177, 218 184, 223 193 C 238 218, 296 210, 303 237 C 311 266, 262 296, 207 301 C 176 304, 150 306, 118 309" />
        <circle className="is-blue" cx="162" cy="27" r="5" />
        <circle className="is-sun" cx="223" cy="78" r="5" />
        <circle className="is-blue" cx="223" cy="193" r="5" />
        <circle className="is-sun" cx="303" cy="237" r="5" />
        <circle className="is-ink" cx="207" cy="301" r="5" />
      </svg>
      <ol
        id="how-it-works"
        className="hm-steps"
        aria-label="How GhostReport works"
      >
        {STEPS.map(([icon, title, text], index) => (
          <li className={`hm-step hm-step-${index + 1}`} key={icon}>
            <span className="hm-step-icon">
              <Icon name={icon} />
            </span>
            <span className="hm-step-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{title}</strong>
            <span className="hm-step-text">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Decorative vertical captions at the hero's right edge, one word per line.
function SideNote({ text, className }: { text: string; className: string }) {
  return (
    <p className={`hm-side-note ${className}`} aria-hidden="true">
      {text.split(" ").map((word) => (
        <span key={word}>{word}</span>
      ))}
    </p>
  );
}

export function HomePage() {
  return (
    <Shell className="home-site">
      <main className="hm">
        <section className="hm-hero" aria-labelledby="home-title">
          <div className="hm-hero-art" aria-hidden="true">
            <span className="hm-brush hm-brush-a" />
            <span className="hm-brush hm-brush-b" />
          </div>
          <div className="hm-hero-inner">
            <div className="hm-hero-copy">
              <p className="hm-eyebrow">
                Open source · Reads the code · Finds what isn’t measured
              </p>
              <h1 id="home-title">
                <span>Your users stop</span>{" "}
                <span>
                  at the <em>wallet step</em>.
                </span>
              </h1>
              <p className="hm-subhead">
                Analytics shows where. <em>Not why.</em>
              </p>
              <p className="hm-lead">
                GhostReport finds the moments your events miss and asks the
                people leaving one gentle question. Their answers come back as
                “k of n,” never as a guessed cause.
              </p>
              <div className="hm-actions">
                <a className="hm-button" href="#demo" onClick={playDemo}>
                  <Icon name="play" />
                  Watch the demo
                  <span aria-hidden="true">→</span>
                </a>
                <a className="hm-button hm-button-ghost" href="#how-it-works">
                  How it works
                </a>
              </div>
            </div>
            <div className="hm-hero-side">
              <span className="hm-sun" aria-hidden="true" />
              <p className="hm-motto" lang="ja" aria-hidden="true">
                <span>見えない</span>
                <span>理由を、</span>
                <span>見つけにいく</span>
              </p>
              <Trail />
            </div>
            <SideNote
              className="hm-side-note-top"
              text="Find what isn’t measured"
            />
            <SideNote
              className="hm-side-note-bottom"
              text="Better questions for stronger products"
            />
          </div>
        </section>

        <div className="hm-body">
          <section className="hm-next" aria-label="Explore GhostReport">
            <a className="hm-next-card" href="/ens/">
              <span className="hm-next-icon">
                <Icon name="book" />
              </span>
              <span>
                <strong>
                  Tested on a repo we didn’t write{" "}
                  <span aria-hidden="true">→</span>
                </strong>
                <span>
                  ENS app, read-only at a pinned commit. Explore the workflow
                  and code references checked by hand.
                </span>
              </span>
            </a>
            <a className="hm-next-card" href="/install/">
              <span className="hm-next-icon">
                <Icon name="cube" />
              </span>
              <span>
                <strong>
                  Add it to your app in 3 steps{" "}
                  <span aria-hidden="true">→</span>
                </strong>
                <span>
                  One config file, <code>track()</code>, and one optional
                  question at the exit. Get started in minutes.
                </span>
              </span>
            </a>
          </section>

          <HomeDemo />

          <footer className="hm-footer">
            <span className="hm-footer-brand">
              <strong>GhostReport</strong>
              <span>Open source · Finds what isn’t measured</span>
            </span>
            <nav aria-label="Footer">
              <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
                Docs
              </a>
              <a
                href={`${REPO_URL}/blob/main/docs/PROJECT_GUIDE.th.md#privacy`}
                target="_blank"
                rel="noreferrer"
              >
                Privacy
              </a>
              <a href="/about/">About</a>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <Icon name="github" />
                GitHub <span aria-hidden="true">↗</span>
              </a>
            </nav>
          </footer>
        </div>
      </main>
    </Shell>
  );
}
