import { DemoClips } from "./DemoClips";

export function HomeDemo() {
  return (
    <section
      id="demo"
      className="home-demo ink-demo"
      aria-labelledby="home-demo-title"
    >
      <header className="ink-section-heading">
        <div>
          <p className="home-eyebrow">See it in action</p>
          <h2 id="home-demo-title">Simulated user sessions</h2>
          <p className="ink-source-label">
            Simulated users (Playwright) — seed
          </p>
        </div>
        <a href="/seed/">
          Watch all sessions <span aria-hidden="true">→</span>
        </a>
      </header>
      <DemoClips variant="featured" />
    </section>
  );
}
