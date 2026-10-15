import { useState } from "react";
import { JourneyFlow } from "./JourneyFlow";
import type { JourneySource } from "./journeys";

export function Segments() {
  const [source, setSource] = useState<JourneySource | undefined>();
  return (
    <section id="segments" className="segments-section" aria-label="Segments">
      <div className="graph-section-toolbar">
        <div>
          <span className="evidence-label">Observed</span>
          <h2>Segments</h2>
        </div>
        <div
          className="graph-toggle"
          role="group"
          aria-label="Journey population"
        >
          {(
            [
              ["All", undefined],
              ["Visitors", "visitor"],
              ["Seed", "seed"],
            ] as const
          ).map(([label, value]) => (
            <button
              type="button"
              key={label}
              aria-pressed={source === value}
              onClick={() => setSource(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <JourneyFlow source={source} />
    </section>
  );
}
