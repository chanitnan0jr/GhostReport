import { useEffect, useId, useState } from "react";
import { safeText, sessions } from "./format";
import {
  fetchJourneys,
  journeySourceNames,
  journeySources,
  type JourneyGraph,
  type JourneyNode,
  type JourneySource,
  type SourceCounts,
} from "./journeys";
import "./JourneyFlow.css";

function SourceSplit({
  counts,
  total,
}: {
  counts: SourceCounts;
  total: number;
}) {
  return (
    <span className="journey-sources">
      {journeySources.map((source) => (
        <span key={source}>
          <span>{journeySourceNames[source]}</span>
          <strong>{sessions(counts[source], total)}</strong>
        </span>
      ))}
    </span>
  );
}

function labelLines(label: string): string[] {
  const lines: string[] = [];
  for (const word of label.split(" ")) {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > 23) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return lines;
}

const nodeWidth = 218;
const nodeHeight = 100;
const columnWidth = 278;

export function JourneyDiagram({ graph }: { graph: JourneyGraph }) {
  const [selected, setSelected] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const markerId = useId().replaceAll(":", "");
  const nodes = [...graph.nodes];
  for (const segment of graph.segments) {
    if (!nodes.some((node) => node.id === segment.id))
      nodes.push({
        id: segment.id,
        column: 7,
        row: graph.segments.indexOf(segment),
        label: segment.label,
        kind: "segment",
        count: segment.sessions,
        by_source: segment.by_source,
      });
  }
  const columns = [...graph.columns].sort((a, b) => a.index - b.index);
  const positions = new Map<
    string,
    { x: number; y: number; node: JourneyNode }
  >();
  let rows = 1;
  for (const [columnIndex, column] of columns.entries()) {
    const members = nodes
      .filter((node) => node.column === column.index)
      .sort((a, b) =>
        column.index === 7
          ? graph.segments.findIndex((s) => s.id === a.id) -
            graph.segments.findIndex((s) => s.id === b.id)
          : a.row - b.row,
      );
    rows = Math.max(rows, members.length);
    members.forEach((node, row) =>
      positions.set(node.id, {
        x: 24 + columnIndex * columnWidth,
        y: 70 + row * 142,
        node,
      }),
    );
  }
  const width = columns.length * columnWidth;
  const height = 88 + rows * 142;
  const chosen = graph.segments.find((segment) => segment.id === selected);

  return (
    <section className="journey-flow" aria-labelledby={titleId}>
      <div className="journey-heading">
        <div>
          <span className="journey-evidence">Observed</span>
          <h2 id={titleId}>Journeys to three segments</h2>
        </div>
        <span className="journey-total">
          {sessions(graph.sessions, graph.sessions)}
        </span>
      </div>
      <p id={descriptionId}>
        Segments group the report’s existing cohorts. Choose a card to highlight
        its segment and incoming paths. Scroll horizontally to follow the full
        flow.
      </p>
      <p className="journey-population">
        {graph.only
          ? journeySourceNames[graph.only]
          : "All recorded sources — seed, test and visitor sessions"}
      </p>
      <SourceSplit counts={graph.by_source} total={graph.sessions} />
      {graph.sessions === 0 && (
        <p className="journey-notice">
          No recorded sessions in this population yet.
        </p>
      )}
      <div
        className="journey-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable journey flowchart"
        aria-describedby={descriptionId}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={
            chosen
              ? `Journey flowchart. Highlighted segment: ${chosen.label}`
              : "Journey flowchart from entry through segment and probe"
          }
        >
          <defs>
            <marker
              id={`${markerId}-normal`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#738b9a" />
            </marker>
            <marker
              id={`${markerId}-selected`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#87e1c3" />
            </marker>
          </defs>
          {columns.map((column, index) => (
            <text
              key={column.index}
              className="journey-column-label"
              x={24 + index * columnWidth}
              y={34}
            >
              {safeText(column.label)}
            </text>
          ))}
          {graph.edges.map((edge) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const start = from.x + nodeWidth;
            const end = to.x - 4;
            const middle = (start + end) / 2;
            const y1 = from.y + nodeHeight / 2;
            const y2 = to.y + nodeHeight / 2;
            const active = edge.target === selected;
            return (
              <g
                key={`${edge.source}:${edge.target}`}
                className={`journey-edge${active ? " is-selected" : ""}${selected && !active ? " is-dimmed" : ""}`}
              >
                <title>{`${from.node.label} → ${to.node.label}: ${sessions(edge.count, graph.sessions)}. ${journeySources.map((s) => `${s}: ${sessions(edge.by_source[s], edge.count)}`).join("; ")}`}</title>
                <path
                  d={`M ${start} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${end} ${y2}`}
                  fill="none"
                  strokeWidth={
                    2 + (5 * edge.count) / Math.max(1, graph.sessions)
                  }
                  markerEnd={`url(#${markerId}-${active ? "selected" : "normal"})`}
                />
              </g>
            );
          })}
          {[...positions.values()].map(({ x, y, node }) => {
            const active = node.id === selected;
            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                className={`journey-node${node.kind === "segment" ? " is-segment" : ""}${active ? " is-selected" : ""}${selected && node.kind === "segment" && !active ? " is-dimmed" : ""}`}
              >
                <title>{`${node.label}: ${sessions(node.count, graph.sessions)}. ${journeySources.map((s) => `${journeySourceNames[s]}: ${sessions(node.by_source[s], node.count)}`).join("; ")}`}</title>
                <rect width={nodeWidth} height={nodeHeight} rx="9" />
                <text x="14" y="26">
                  {labelLines(safeText(node.label)).map((line, index) => (
                    <tspan key={index} x="14" dy={index ? 19 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text className="journey-node-count" x="14" y="82">
                  {sessions(node.count, graph.sessions)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="journey-selection" role="status">
        {chosen
          ? `Highlighted: ${chosen.label}. Select the card again to clear.`
          : "Showing all three segments."}
      </p>
      <div className="journey-segments" aria-label="Journey segments">
        {graph.segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            className={`journey-segment-card${selected === segment.id ? " is-selected" : ""}`}
            aria-pressed={selected === segment.id}
            onClick={() =>
              setSelected((previous) =>
                previous === segment.id ? null : segment.id,
              )
            }
          >
            <span className="journey-card-heading">
              <strong>{safeText(segment.label)}</strong>
              <span>
                {selected === segment.id ? "Highlighted" : "Highlight ↗"}
              </span>
            </span>
            {segment.segment === "stalled_at_wallet" && (
              <span className="journey-investigated">
                Investigated population
              </span>
            )}
            <strong className="journey-card-count">
              {sessions(segment.sessions, graph.sessions)}
            </strong>
            <span className="journey-definition">
              {safeText(segment.definition)}
            </span>
            <span className="journey-probe">Asked: {segment.probe ?? "—"}</span>
            <SourceSplit counts={segment.by_source} total={segment.sessions} />
            <span className="journey-cohorts">
              Cohorts:{" "}
              {Object.entries(segment.cohorts)
                .map(
                  ([cohort, number]) =>
                    `${cohort}: ${sessions(number, segment.sessions)}`,
                )
                .join(" · ") || "No recorded cohort sessions"}
            </span>
            <span className="journey-coverage">
              Coverage complete:{" "}
              {sessions(segment.coverage.complete, segment.sessions)} · Unknown:{" "}
              {sessions(segment.coverage.unknown, segment.sessions)}
            </span>
            <span className="journey-paths-heading">Most common paths</span>
            {segment.top_paths.length ? (
              segment.top_paths.map((path, index) => (
                <span className="journey-top-path" key={index}>
                  <span className="journey-path-count">
                    {path.sessions}×{" "}
                    <span>· {sessions(path.sessions, segment.sessions)}</span>
                  </span>
                  <span className="journey-path-chips">
                    {path.steps.map((step, stepIndex) => (
                      <span
                        className="journey-chip-pair"
                        key={`${stepIndex}:${step}`}
                      >
                        {stepIndex > 0 && (
                          <span
                            className="journey-path-arrow"
                            aria-hidden="true"
                          >
                            →
                          </span>
                        )}
                        <span className="journey-step-chip">
                          {safeText(step)}
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
              ))
            ) : (
              <span className="journey-empty-path">No recorded paths yet.</span>
            )}
          </button>
        ))}
      </div>
      <div className="journey-notes">
        <p>
          “Asked” identifies the configured decision point; it does not mean
          every session in that segment received a question.
        </p>
        {graph.notes.map((note, index) => (
          <p key={index}>{safeText(note)}</p>
        ))}
      </div>
    </section>
  );
}

function JourneyLoader({ source }: { source?: JourneySource }) {
  const [graph, setGraph] = useState<JourneyGraph | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const value = await fetchJourneys(
          source,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
        if (!controller.signal.aborted) {
          setGraph(value);
          setError("");
        }
      } catch (failure: unknown) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Journey data unavailable",
          );
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void refresh(), 3000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [source]);
  return (
    <>
      {error && (
        <p className="journey-fetch-warning" role="alert">
          {safeText(error)}.{" "}
          {graph
            ? "The previous chart is retained."
            : "No journey data is displayed."}{" "}
          Retrying automatically.
        </p>
      )}
      {graph ? (
        <JourneyDiagram graph={graph} />
      ) : (
        !error && (
          <p className="journey-loading" role="status">
            Loading recorded journeys…
          </p>
        )
      )}
    </>
  );
}

export function JourneyFlow({ source }: { source?: JourneySource }) {
  return <JourneyLoader key={source ?? "all"} source={source} />;
}
