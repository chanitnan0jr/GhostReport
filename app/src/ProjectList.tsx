import type { Project } from "./types";

export function ProjectList({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (id: string) => void;
}) {
  return (
    <main className="page">
      <section className="intro">
        <h1>
          Good ideas.
          <br />
          <span>Common ground.</span>
        </h1>
        <div className="intro-copy">
          <p>Small grants for people building a better commons.</p>
          <p className="muted">
            Explore a project, find your fit, and bring your idea to life.
          </p>
        </div>
      </section>
      <div className="section-heading">
        <h2>Find your next beginning</h2>
        <span>{projects.length} open grant programs</span>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <button
            className="project-row"
            key={project.id}
            onClick={() => onSelect(project.id)}
          >
            <span className={`project-art ${project.color}`} aria-hidden="true">
              <span>{project.number}</span>
            </span>
            <span className="project-info">
              <span className="category">{project.category}</span>
              <span className="project-title">{project.title}</span>
              <span className="project-summary">{project.summary}</span>
            </span>
            <span className="grant-amount">
              {project.grant}
              <span>Grant range</span>
            </span>
            <svg
              className="arrow"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        ))}
      </div>
      <p className="end-note">A little support can go a long way.</p>
    </main>
  );
}
