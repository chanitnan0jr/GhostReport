import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Panel } from "./components";
import { findingText, safeText, selfReportLabel, time } from "./format";
import type { Finding } from "./types";
import { FindingSources } from "./Sources";
import {
  evidenceSourceLink,
  fetchEvidence,
  type EvidenceGraph,
  type EvidenceNode,
} from "./evidence";
import "@xyflow/react/dist/style.css";
import "./EvidenceMap.css";

const kindNames = {
  code: "Code evidence",
  hypothesis: "Hypothesis",
  option: "Answer option",
  rule: "Policy observation",
  finding: "Self-report",
  segment: "Segment",
};
const colors = {
  code: "#b1c7db",
  hypothesis: "#cfb4ef",
  option: "#98c6ed",
  rule: "#eac27a",
  finding: "#8fe0c1",
  segment: "#bad593",
};
type MapNode = Node<{ label: ReactNode }>;

function nodeDetail(node: EvidenceNode) {
  if (node.kind === "finding")
    return findingText(node) ?? "Count withheld by validation guard";
  if (node.kind === "hypothesis") return node.statement;
  if (node.kind === "code") return node.desc;
  if (node.kind === "option") return node.decision_point;
  return node.kind === "rule" ? "Event observation" : "Question population";
}

function Details({
  node,
  conflict,
}: {
  node: EvidenceNode;
  conflict: boolean;
}) {
  return (
    <aside
      className="evidence-map-details"
      aria-label="Selected hypothesis evidence"
    >
      <span className="evidence-label">{kindNames[node.kind]}</span>
      <h3>{safeText(node.label)}</h3>
      {node.kind === "code" && (
        <>
          <p>{safeText(node.desc)}</p>
          <p className="small muted">{safeText(node.instrumentation)}</p>
          {evidenceSourceLink(node.permalink) ? (
            <a
              href={evidenceSourceLink(node.permalink)!}
              target="_blank"
              rel="noreferrer"
            >
              <code>
                {node.file}:{node.lines.join("–")}
              </code>{" "}
              ↗
            </a>
          ) : (
            <>
              <code>
                {node.file}:{node.lines.join("–")}
              </code>
              <p className="small muted">
                A pinned source permalink is not supplied.
              </p>
            </>
          )}
          <pre>
            <code>{safeText(node.quote)}</code>
          </pre>
        </>
      )}
      {node.kind === "hypothesis" && (
        <>
          <p>{safeText(node.statement)}</p>
          {node.generic && <span className="generic">generic</span>}
          <dl>
            <dt>v1</dt>
            <dd>{safeText(node.v1)}</dd>
            <dt>Current self-report labels</dt>
            <dd>{node.current.map(selfReportLabel).join(" · ")}</dd>
          </dl>
          <p className="small muted">
            Highlight uses the evidence links supplied by the backend.
            Respondent counts are shown on each finding.
          </p>
        </>
      )}
      {node.kind === "finding" && (
        <>
          <span className="status neutral">
            {node.respondents < 3
              ? "Unresolved"
              : selfReportLabel(node.self_report)}
          </span>
          {conflict && <span className="conflict">Evidence conflict</span>}
          <p className="evidence-finding-count">
            {findingText(node) ?? "Count withheld by validation guard"}
          </p>
          <FindingSources finding={node} />
          <dl>
            <dt>Decision point</dt>
            <dd>{safeText(node.decision_point)}</dd>
            <dt>Cohort</dt>
            <dd>{safeText(node.cohort)}</dd>
            <dt>Observation</dt>
            <dd>{safeText(node.observation)}</dd>
          </dl>
        </>
      )}
      {node.kind === "option" && (
        <p>Approved answer option at {safeText(node.decision_point)}.</p>
      )}
      {node.kind === "rule" && (
        <>
          <p>{safeText(node.text)}</p>
          <p className="small muted">
            This rule contributes an observation from recorded events.
          </p>
        </>
      )}
      {node.kind === "segment" && <p>{safeText(node.segment)}</p>}
    </aside>
  );
}

function EvidenceDiagram({
  graph,
  findings,
}: {
  graph: EvidenceGraph;
  findings: Finding[];
}) {
  const flow = useRef<ReactFlowInstance<MapNode> | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const highlighted = useMemo(
    () => (highlight ? new Set(graph.highlight[highlight] ?? []) : null),
    [graph.highlight, highlight],
  );
  const hypotheses = graph.nodes.filter((node) => node.kind === "hypothesis");
  const nodes = useMemo<MapNode[]>(
    () =>
      graph.columns.flatMap((column) =>
        graph.nodes
          .filter((node) => node.column === column.index)
          .map((node, row) => ({
            id: node.id,
            position: { x: column.index * 340, y: row * 156 },
            width: 264,
            height: 128,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            selected: node.id === selected,
            ariaLabel: `${kindNames[node.kind]}: ${node.label}. Open evidence details.`,
            className: "hypothesis-map-node",
            style: {
              borderColor: colors[node.kind],
              opacity: highlighted && !highlighted.has(node.id) ? 0.3 : 1,
            },
            data: {
              label: (
                <div>
                  <span>{kindNames[node.kind]}</span>
                  <strong>
                    {safeText(node.label)}
                    {node.kind === "hypothesis" && node.generic && (
                      <small>generic</small>
                    )}
                  </strong>
                  <p>{safeText(nodeDetail(node))}</p>
                </div>
              ),
            },
          })),
      ),
    [graph.columns, graph.nodes, highlighted, selected],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge, index) => ({
        id: `evidence:${index}`,
        source: edge.source,
        target: edge.target,
        label: safeText(edge.relation),
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: highlighted ? "#bda1e8" : "#829baa",
          opacity:
            highlighted &&
            (!highlighted.has(edge.source) || !highlighted.has(edge.target))
              ? 0.12
              : 1,
          strokeWidth:
            highlighted &&
            highlighted.has(edge.source) &&
            highlighted.has(edge.target)
              ? 2.5
              : 1.4,
        },
      })),
    [graph.edges, highlighted],
  );
  const chosen = graph.nodes.find((node) => node.id === selected);
  function choose(node: EvidenceNode) {
    setSelected(node.id);
    if (node.kind === "hypothesis") {
      setHighlight(node.id);
      requestAnimationFrame(
        () =>
          void flow.current?.fitView({
            nodes: (graph.highlight[node.id] ?? []).map((id) => ({ id })),
            padding: 0.2,
            maxZoom: 1,
          }),
      );
    }
  }
  return (
    <>
      <div
        className="evidence-hypothesis-select"
        role="group"
        aria-label="Highlight hypothesis"
      >
        <button
          type="button"
          aria-pressed={highlight === null}
          onClick={() => {
            setHighlight(null);
            void flow.current?.fitView({ padding: 0.16 });
          }}
        >
          All hypotheses
        </button>
        {hypotheses.map((node) => (
          <button
            type="button"
            key={node.id}
            aria-pressed={highlight === node.id}
            onClick={() => choose(node)}
          >
            {safeText(node.label)}
            {node.kind === "hypothesis" && node.generic && (
              <small>generic</small>
            )}
          </button>
        ))}
      </div>
      <p className="small muted">
        {graph.columns.map((column) => safeText(column.label)).join(" → ")}
      </p>
      <div className="evidence-map-body has-details">
        <div className="evidence-map-canvas">
          <ReactFlow<MapNode>
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
              flow.current = instance;
            }}
            onNodesChange={(changes) => {
              const selection = changes.find(
                (change) => change.type === "select" && change.selected,
              );
              if (selection?.type === "select") {
                const item = graph.nodes.find(
                  (node) => node.id === selection.id,
                );
                if (item) choose(item);
              }
            }}
            onNodeClick={(_, node) => {
              const item = graph.nodes.find((n) => n.id === node.id);
              if (item) choose(item);
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.06}
            maxZoom={2}
            colorMode="dark"
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {chosen ? (
          <Details
            node={chosen}
            conflict={
              chosen.kind === "finding" &&
              findings.some(
                (finding) =>
                  chosen.id.endsWith(`:${finding.hypothesis_id}`) &&
                  chosen.decision_point === finding.decision_point &&
                  chosen.cohort === finding.cohort &&
                  chosen.selected === finding.selected &&
                  chosen.respondents === finding.respondents &&
                  chosen.text === finding.text &&
                  chosen.self_report === finding.self_report &&
                  chosen.observation === finding.observation &&
                  finding.evidence_conflict,
              )
            }
          />
        ) : (
          <aside className="evidence-map-details">
            <h3>Inspect evidence</h3>
            <p>
              Select a hypothesis to highlight its supplied evidence links, or
              select a node to read its details.
            </p>
          </aside>
        )}
      </div>
      <p className="small muted">
        Self-report and event observations are separate evidence types. Counts
        describe respondents within each question population.
      </p>
    </>
  );
}

export default function EvidenceMap({
  revision,
  findings,
}: {
  revision: string;
  findings: Finding[];
}) {
  const [graph, setGraph] = useState<EvidenceGraph | null>(null);
  const [error, setError] = useState("");
  const [received, setReceived] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchEvidence(
      AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setGraph(value);
          setError("");
          setReceived(new Date().toISOString());
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Hypothesis evidence unavailable",
          );
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <Panel
      id="evidence"
      title="Hypothesis evidence map"
      label="Code evidence → Self-report / Policy"
      description="Follow the locked hypotheses through their approved questions, findings and segment."
    >
      {error && (
        <p className="warning" role="alert">
          {safeText(error)}
          {graph && " The last received map is retained."}
        </p>
      )}
      {graph ? (
        <>
          <EvidenceDiagram graph={graph} findings={findings} />
          {graph.notes
            .filter((note) => safeText(note) === note)
            .map((note, index) => (
              <p key={index} className="small muted">
                {note}
              </p>
            ))}
        </>
      ) : (
        !error && <p role="status">Loading hypothesis evidence…</p>
      )}
      {received && (
        <p className="small muted">
          Evidence received {time(received)} · All recorded sources; source
          splits are shown in finding details.
        </p>
      )}
    </Panel>
  );
}
