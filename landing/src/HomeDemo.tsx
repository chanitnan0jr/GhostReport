import { DemoClips } from "./DemoClips";

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
      <DemoClips />
    </section>
  );
}
