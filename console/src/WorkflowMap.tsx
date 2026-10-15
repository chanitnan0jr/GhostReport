import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { Panel } from "./components";
import { safeText } from "./format";
import {
  fetchWorkflow,
  instrumentationColors,
  instrumentationLabels,
  workflowPermalink,
  type WorkflowFact,
  type WorkflowTarget,
  type WorkflowView,
} from "./workflow";
import "@xyflow/react/dist/style.css";
import "./WorkflowMap.css";

const width = 246;
const height = 124;
type MapNode = Node<{ label: ReactNode }>;

function layout(view: WorkflowView) {
  if (!view.nodes.length)
    return {
      nodes: [] as MapNode[],
      edges: [] as Edge[],
      unattached: new Set<string>(),
    };
  const states = view.nodes
    .filter((node) => node.kind === "state")
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const edges: Edge[] = states.slice(1).map((node, index) => ({
    id: `state:${states[index].id}:${node.id}`,
    source: states[index].id,
    target: node.id,
    label: "State order",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#9bafbd" },
  }));
  const unattached = new Set<string>();
  for (const node of view.nodes.filter((item) => item.kind !== "state")) {
    const parent = states
      .filter((state) => state.file === node.file)
      .sort(
        (a, b) =>
          Math.abs(a.lines[0] - node.lines[0]) -
            Math.abs(b.lines[0] - node.lines[0]) || a.order - b.order,
      )[0];
    if (!parent) {
      unattached.add(node.id);
      continue;
    }
    edges.push({
      id: `file:${parent.id}:${node.id}`,
      source: parent.id,
      target: node.id,
      type: "smoothstep",
      label: "Same file",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#6e8698", strokeDasharray: "5 5" },
    });
  }
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 100,
    nodesep: 42,
    marginx: 32,
    marginy: 32,
  });
  view.nodes.forEach((node) => graph.setNode(node.id, { width, height }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  const nodes: MapNode[] = view.nodes.map((fact) => {
    const position = graph.node(fact.id);
    return {
      id: fact.id,
      position: { x: position.x - width / 2, y: position.y - height / 2 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      width,
      height,
      className: `workflow-graph-node ${fact.instrumentation}`,
      ariaLabel: `${fact.kind.replaceAll("_", " ")}: ${fact.id}. Open code evidence.`,
      data: {
        label: (
          <div className="workflow-node-label">
            <span>{fact.kind.replaceAll("_", " ")}</span>
            <strong>{safeText(fact.id)}</strong>
            <span>{instrumentationLabels[fact.instrumentation]}</span>
            {fact.ref_check && (
              <small className="workflow-ref-badge">{fact.ref_check}</small>
            )}
          </div>
        ),
      },
      style: { borderColor: instrumentationColors[fact.instrumentation] },
    };
  });
  return { nodes, edges, unattached };
}

function CodeDetails({
  view,
  fact,
  unattached,
}: {
  view: WorkflowView;
  fact: WorkflowFact;
  unattached: boolean;
}) {
  const href = workflowPermalink(view, fact);
  const lines =
    fact.lines[0] === fact.lines[1] ? fact.lines[0] : fact.lines.join("–");
  return (
    <aside className="workflow-inspector" aria-label="Selected code evidence">
      <span className="evidence-label">Code evidence</span>
      <h3>{safeText(fact.id)}</h3>
      <span className={`workflow-instrumentation ${fact.instrumentation}`}>
        {instrumentationLabels[fact.instrumentation]}
      </span>
      <p>{safeText(fact.desc)}</p>
      <div className="workflow-ref-check">
        <span className="workflow-ref-badge">
          {fact.ref_check ?? "Not manually reviewed"}
        </span>
        {fact.ref_note && <p>{safeText(fact.ref_note)}</p>}
      </div>
      <div className="workflow-file-ref">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            <code>
              {fact.file}:{lines}
            </code>{" "}
            ↗
          </a>
        ) : (
          <code>
            {fact.file}:{lines}
          </code>
        )}
      </div>
      {!href && (
        <p className="small muted">
          {safeText(
            view.permalinks ??
              "A pinned source permalink is not supplied for this node.",
          )}
        </p>
      )}
      <pre className="workflow-quote">
        <code>{safeText(fact.quote)}</code>
      </pre>
      {unattached && (
        <p className="small muted">
          No state in the same file was returned; this fact has no file
          attachment edge.
        </p>
      )}
    </aside>
  );
}

function WorkflowGraph({
  view,
  initialFact,
}: {
  view: WorkflowView;
  initialFact: string | null;
}) {
  const arranged = useMemo(() => layout(view), [view]);
  const [chosen, setChosen] = useState<string | null>(initialFact);
  useEffect(() => {
    if (initialFact) setChosen(initialFact);
  }, [initialFact]);
  const fact = view.nodes.find((node) => node.id === chosen) ?? view.nodes[0];
  const nodes = useMemo(
    () =>
      arranged.nodes.map((node) => ({
        ...node,
        selected: node.id === fact?.id,
      })),
    [arranged.nodes, fact?.id],
  );
  return (
    <div className="workflow-map-body">
      <div className="workflow-canvas" aria-label="Workflow graph">
        <ReactFlow<MapNode>
          key={`${view.target}:${view.commit}`}
          nodes={nodes}
          edges={arranged.edges}
          onNodeClick={(_, node) => setChosen(node.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          onNodesChange={(changes) => {
            const selection = changes.find(
              (change) => change.type === "select" && change.selected,
            );
            if (selection?.type === "select") setChosen(selection.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.08}
          maxZoom={2}
          colorMode="dark"
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {fact ? (
        <CodeDetails
          view={view}
          fact={fact}
          unattached={arranged.unattached.has(fact.id)}
        />
      ) : (
        <p className="muted">No code facts returned.</p>
      )}
    </div>
  );
}

export default function WorkflowMap({ revision }: { revision?: string }) {
  const [target, setTarget] = useState<WorkflowTarget>("app");
  const [view, setView] = useState<WorkflowView | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [initialFact, setInitialFact] = useState<string | null>(() =>
    location.hash.startsWith("#fact-") ? location.hash.slice(6) : null,
  );
  useEffect(() => {
    const onHash = () => {
      if (!location.hash.startsWith("#fact-")) return;
      setInitialFact(location.hash.slice(6));
      setTarget("app");
      document.getElementById("workflow")?.scrollIntoView();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setView(null);
    setError("");
    void fetchWorkflow(
      target,
      AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    )
      .then((value) => {
        if (!controller.signal.aborted) setView(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Workflow Map unavailable",
          );
      });
    return () => controller.abort();
  }, [target, revision, retry]);
  return (
    <Panel
      id="workflow"
      title="Workflow Map"
      label="Code evidence"
      description="Edges follow state order and file associations. Select a node to inspect its source evidence."
    >
      <div className="graph-section-toolbar">
        <div className="graph-toggle" role="group" aria-label="Workflow target">
          {(
            [
              ["Our app", "app"],
              ["ENS", "ens"],
            ] as const
          ).map(([label, value]) => (
            <button
              type="button"
              key={value}
              aria-pressed={target === value}
              onClick={() => {
                setInitialFact(null);
                setTarget(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {view && (
          <span className="small muted">
            {safeText(view.mode)} · {view.scope.searched_files} searched files
            {view.scope.truncated && " · Truncated scope"}
          </span>
        )}
      </div>
      {error ? (
        <div className="warning" role="alert">
          <span>{safeText(error)}</span>
          <button
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !view ? (
        <p role="status">Loading Workflow Map…</p>
      ) : (
        <>
          <p className="small muted">
            {safeText(view.label)} · Commit <code>{view.commit}</code>
          </p>
          <div className="workflow-legend" aria-label="Instrumentation legend">
            {Object.entries(view.legend).map(([key, description]) => (
              <span key={key}>
                <i
                  style={{
                    background:
                      instrumentationColors[
                        key as keyof typeof instrumentationColors
                      ],
                  }}
                  aria-hidden="true"
                />
                <strong>
                  {
                    instrumentationLabels[
                      key as keyof typeof instrumentationLabels
                    ]
                  }
                </strong>{" "}
                · {safeText(description)}
              </span>
            ))}
          </div>
          <WorkflowGraph key={target} view={view} initialFact={initialFact} />
        </>
      )}
    </Panel>
  );
}
