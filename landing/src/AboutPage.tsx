import { REPO_URL } from "./content";
import { Shell } from "./HomePage";

const HOW = [
  [
    "Read the code",
    "An AI reads the repository at a pinned commit and maps the workflow: where each step is, and which steps record an event. Every code reference is checked mechanically.",
  ],
  [
    "Lock hypotheses",
    "Hypotheses and the questions that test them are approved by a person and locked as v1. Its digest is published outside the system before the first answer.",
  ],
  [
    "Ask at the exit",
    "When someone leaves at a step under investigation, one optional question may appear. Skip is one click and never blocks the exit.",
  ],
  [
    "Report k of n",
    "Answers are reported as “k of n respondents”, split into seed and visitors, next to what the events show. The AI summary is checked against the facts; it never claims a cause.",
  ],
] as const;

const SIMULATED = [
  [
    "Simulated users",
    "20 Playwright sessions (seed) that click through the real app. Reported as seed, never as visitors.",
  ],
  [
    "Mock wallet",
    "An in-page wallet: no extension, no real funds. The first connection may show a simulated network error once.",
  ],
  [
    "Demo app",
    "Common Ground DAO is a grant app we wrote for this demo, in this repository.",
  ],
  [
    "Real-repo test",
    "ENS app (ensdomains/ens-app-v3, MIT), read-only at a pinned commit. Nothing deployed or changed.",
  ],
] as const;

const STACK = [
  ["Frontend", "React + Vite + TypeScript"],
  ["Engine", "Python, FastAPI, Pydantic, SQLite (append-only)"],
  ["AI", "DeepSeek, behind schema validation, guards and a claim checker"],
  ["Testing", "pytest, Vitest, Playwright (also drives the seed users)"],
  ["Deploy", "Docker; Railway"],
] as const;

function List({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <ul className="about-list">
      {rows.map(([title, text]) => (
        <li key={title}>
          <strong>{title}</strong>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function AboutPage() {
  return (
    <Shell>
      <main className="gr-page">
        <span className="gr-kicker">About</span>
        <h1>About GhostReport</h1>
        <p className="gr-lead">
          A way to find what isn’t measured, using code evidence and one
          optional question, without guessing why people left.
        </p>
        <div className="about-grid">
          <section className="gr-card">
            <h2>How it works</h2>
            <List rows={HOW} />
          </section>
          <div>
            <section className="gr-card">
              <h2>What’s simulated</h2>
              <List rows={SIMULATED} />
            </section>
            <section className="gr-card" style={{ marginTop: 20 }}>
              <h2>Tech stack</h2>
              <List rows={STACK} />
            </section>
          </div>
        </div>
        <div className="gr-actions">
          <a
            className="gr-button-quiet"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub ↗
          </a>
          <a className="gr-button-quiet" href="/report/">
            v1 digest and report →
          </a>
          <a className="gr-button-quiet" href="/api/report">
            Report API ↗
          </a>
        </div>
      </main>
    </Shell>
  );
}
