import { useEffect } from "react";
import type { Tracker } from "./track";
import type { Project } from "./types";

export function ProjectPage({
  project,
  visitId,
  tracker,
  onBack,
  onApply,
}: {
  project: Project;
  visitId: string;
  tracker: Tracker;
  onBack: () => void;
  onApply: () => void;
}) {
  useEffect(() => {
    tracker.trackOnce(`project:${visitId}`, "project_viewed", "ProjectPage", {
      project_id: project.id,
    });
  }, [project.id, tracker, visitId]);

  return (
    <main className="page detail-page">
      <button className="back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M19 12H5m6-6-6 6 6 6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        Back to projects
      </button>
      <div className="detail-layout">
        <article>
          <span className="category">{project.category}</span>
          <h1>{project.title}</h1>
          <p className="detail-lead">{project.summary}</p>
          <div className={`detail-art ${project.color}`} aria-hidden="true">
            <span>{project.number}</span>
            <span className="art-caption">Ideas for everyone.</span>
          </div>
          <h2>About this grant</h2>
          <p>{project.description}</p>
          <h2>What we’re looking for</h2>
          <ul className="goals">
            {project.goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </article>
        <aside className="apply-panel">
          <p className="category">Funding your next step</p>
          <h2>{project.grant}</h2>
          <p>
            Bring a focused idea and a plan. We’ll help you take it further.
          </p>
          <button className="button primary full" onClick={onApply}>
            Apply
          </button>
          <p className="small muted">
            Applications are open. Take your time to explore.
          </p>
        </aside>
      </div>
    </main>
  );
}
