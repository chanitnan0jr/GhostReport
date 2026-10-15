import projects from "../../app/src/data/projects.json";
import { SiteHeader } from "./SiteHeader";

export function DaoHome({
  onStart,
  preparing,
  error,
}: {
  onStart: (projectId?: string) => void;
  preparing: boolean;
  error: string;
}) {
  return (
    <div className="dao-home">
      <div className="dao-container">
        <SiteHeader light />
        <main>
          <section className="dao-hero">
            <div>
              <p className="dao-eyebrow">
                Community-led funding · Common Ground DAO
              </p>
              <h1>
                Good ideas.
                <br />
                <span>Common ground.</span>
              </h1>
              <p className="dao-intro">
                Small grants for people building a better commons. Find your
                community, explore an idea, and give it room to grow.
              </p>
              <div className="dao-actions">
                <a className="dao-button" href="#programs">
                  Explore grant programs <span aria-hidden="true">↘</span>
                </a>
                <button
                  className="dao-text-button"
                  disabled={preparing}
                  onClick={() => onStart()}
                >
                  {preparing
                    ? "Preparing your session…"
                    : "Try the app as a user"}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              <p className="dao-demo-note">
                Demo DAO. The wallet is simulated. No real wallet or funds. A
                network error may be simulated once.
              </p>
            </div>
            <div className="dao-art" aria-hidden="true">
              <span className="dao-orbit orbit-one" />
              <span className="dao-orbit orbit-two" />
              <span className="dao-orbit orbit-three" />
              <span className="dao-art-caption">
                A little support.
                <br />A shared future.
              </span>
            </div>
          </section>
          {error && (
            <p className="dao-error" role="alert">
              {error} Choose a program or try again above.
            </p>
          )}
          <section
            id="programs"
            className="dao-programs"
            aria-labelledby="programs-title"
          >
            <div className="dao-section-heading">
              <div>
                <p className="dao-eyebrow">Open opportunities</p>
                <h2 id="programs-title">Find your next beginning</h2>
              </div>
              <span>{projects.length} open grant programs</span>
            </div>
            <div className="dao-project-grid">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`dao-project ${project.color}`}
                  disabled={preparing}
                  onClick={() => onStart(project.id)}
                >
                  <span className="dao-project-top">
                    <span>{project.category}</span>
                    <span aria-hidden="true">{project.number} ↗</span>
                  </span>
                  <h3>{project.title}</h3>
                  <p>{project.summary}</p>
                  <span className="dao-project-bottom">
                    <span>
                      {project.grant}
                      <small>Grant range</small>
                    </span>
                    <span>Explore program →</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="dao-community">
            <p className="dao-eyebrow">Built for the commons</p>
            <h2>Start small. Build something that belongs to everyone.</h2>
            <p>
              Explore a program, meet the community, and decide whether this is
              the right moment for your idea.
            </p>
          </section>
        </main>
        <footer className="dao-footer">
          <span>Common Ground · Demo DAO</span>
          <nav aria-label="About this demo">
            <a href="/about/">About GhostReport</a>
            <a href="/ens/">Tested on a real repo: ENS ↗</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
