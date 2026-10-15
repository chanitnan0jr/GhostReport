import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
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

const width = 236;
const height = 112;
const colGap = 56;
const rowGap = 28;
const perRow = 3; // facts beside a state wrap after this many
type MapNode = Node<{ label: ReactNode }>;

// States run top to bottom in their recorded order; each state's outcomes and UI facts
// (attached by file and nearest line) sit in rows to its right. The map reads down the
// page at a legible zoom instead of shrinking one long horizontal chain.
function layout(view: WorkflowView) {
  const states = view.nodes
    .filter((node) => node.kind === "state")
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const edges: Edge[] = states.slice(1).map((node, index) => ({
    id: `state:${states[index].id}:${node.id}`,
    source: states[index].id,
    sourceHandle: "bottom",
    target: node.id,
    targetHandle: "top",
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "var(--gr-muted)" },
  }));
  const unattached = new Set<string>();
  const attached = new Map<string, WorkflowFact[]>();
  const loose: WorkflowFact[] = [];
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
      loose.push(node);
      continue;
    }
    attached.set(parent.id, [...(attached.get(parent.id) ?? []), node]);
    edges.push({
      id: `file:${parent.id}:${node.id}`,
      source: parent.id,
      sourceHandle: "right",
      target: node.id,
      targetHandle: "left",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "var(--gr-unknown)", strokeDasharray: "5 5" },
    });
  }
  const place = new Map<string, { x: number; y: number }>();
  let y = 0;
  const lane = (head: WorkflowFact | null, facts: WorkflowFact[]) => {
    if (head) place.set(head.id, { x: 0, y });
    const rows = Math.max(1, Math.ceil(facts.length / perRow));
    facts.forEach((fact, i) =>
      place.set(fact.id, {
        x: (width + colGap) * (1 + (i % perRow)),
        y: y + Math.floor(i / perRow) * (height + rowGap),
      }),
    );
    y += rows * (height + rowGap) + rowGap;
  };
  states.forEach((state) => lane(state, attached.get(state.id) ?? []));
  if (loose.length) lane(null, loose);
  const columns =
    1 +
    Math.min(
      perRow,
      Math.max(0, ...[...attached.values()].map((f) => f.length), loose.length),
    );
  const nodes: MapNode[] = view.nodes.map((fact) => ({
    id: fact.id,
    type: "fact",
    position: place.get(fact.id) ?? { x: 0, y: 0 },
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
  }));
  return {
    nodes,
    edges,
    unattached,
    width: columns * width + (columns - 1) * colGap,
  };
}

// One handle on each side, so state order runs down and file links run right.
function FactNode({ data }: NodeProps<MapNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      {data.label}
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}
const nodeTypes = { fact: FactNode };

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
  const canvas = useRef<HTMLDivElement>(null);
  // Open at a legible zoom: the map's full width, from the top (or on a linked fact).
  function openView(instance: ReactFlowInstance<MapNode>) {
    const box = canvas.current?.getBoundingClientRect();
    const w = box?.width || 800;
    const zoom = Math.min(1, Math.max(0.45, (w - 48) / arranged.width));
    const linked = initialFact && instance.getNode(initialFact);
    if (linked)
      void instance.setCenter(
        linked.position.x + width / 2,
        linked.position.y + height / 2,
        { zoom },
      );
    else
      void instance.setViewport({
        x: Math.max(24, (w - arranged.width * zoom) / 2),
        y: 24,
        zoom,
      });
  }
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
      <div className="workflow-canvas" aria-label="Workflow graph" ref={canvas}>
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
          nodeTypes={nodeTypes}
          onInit={openView}
          fitViewOptions={{ padding: 0.12 }}
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
