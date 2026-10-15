import { useEffect, useId, useRef, useState } from "react";
import type { Cohort, Session } from "./types";
import { cohortInfo } from "./segmentView";
import { sessions } from "./format";
import "./CohortFlow.css";

type Status = "normal" | "success" | "error" | "gap" | "neutral" | "segment";
type Segment = "browsers" | "stalled_at_wallet" | "connected";

export interface FlowNode {
  id: string;
  column: number;
  label: string;
  status: Status;
  rule: number | null;
  // The one cohort this node narrows to; it drives the cohort cards and session list.
  cohort: Cohort | null;
  event: string;
  detail: string;
  segment?: Segment;
  members: Session[];
}
export interface FlowEdge {
  source: string;
  target: string;
  members: Session[];
}

export const columns = [
  "Entry",
  "Wallet gate",
  "Connect attempt",
  "Outcome",
  "Exit / segment",
];

const STATIC: Omit<FlowNode, "members">[] = [
  {
    id: "entry",
    column: 0,
    label: "Recorded sessions",
    status: "normal",
    rule: null,
    cohort: null,
    event: "Any recorded event",
    detail: "Every session in this report snapshot and population.",
  },
  {
    id: "no_gate",
    column: 1,
    label: cohortInfo.no_gate_event.label,
    status: "neutral",
    rule: 4,
    cohort: "no_gate_event",
    event: "No wallet_gate_shown, no wallet_attempted",
    detail:
      "An event is absent. This does not show that the gate was never displayed.",
  },
  {
    id: "gate",
    column: 1,
    label: "Gate or attempt recorded",
    status: "normal",
    rule: null,
    cohort: null,
    event: "wallet_gate_shown or wallet_attempted",
    detail:
      "Rules 1–3. Attempt cohorts are included even when their gate event is missing.",
  },
  {
    id: "attempt",
    column: 2,
    label: "Connect attempt recorded",
    status: "normal",
    rule: null,
    cohort: null,
    event: "wallet_attempted",
    detail:
      "Rules 1–2. A retry is a later attempt in the same session; the session counts once.",
  },
  {
    id: "connected",
    column: 3,
    label: cohortInfo.connected.label,
    status: "success",
    rule: 1,
    cohort: "connected",
    event: "wallet_connected",
    detail: cohortInfo.connected.description,
  },
  {
    id: "no_attempt",
    column: 3,
    label: cohortInfo.gate_event_no_attempt.label,
    status: "neutral",
    rule: 3,
    cohort: "gate_event_no_attempt",
    event: "wallet_gate_shown, no wallet_attempted",
    detail: cohortInfo.gate_event_no_attempt.description,
  },
  {
    id: "seg:browsers",
    column: 4,
    label: "Browsers",
    status: "segment",
    segment: "browsers",
    rule: null,
    cohort: "no_gate_event",
    event: "Segment of rule 4",
    detail: `Groups ${cohortInfo.no_gate_event.label}.`,
  },
  {
    id: "seg:stalled_at_wallet",
    column: 4,
    label: "Stopped at the wallet",
    status: "segment",
    segment: "stalled_at_wallet",
    rule: null,
    cohort: null,
    event: "Segment of rules 2 and 3",
    detail: `Groups ${cohortInfo.gate_event_no_attempt.label} and ${cohortInfo.attempted_no_success.label}.`,
  },
  {
    id: "seg:connected",
    column: 4,
    label: "Connected",
    status: "segment",
    segment: "connected",
    rule: null,
    cohort: "connected",
    event: "Segment of rule 1",
    detail: `Groups ${cohortInfo.connected.label}.`,
  },
];

// Rule 2 split by the state of the session's last attempt (engine/cohorts.py).
const OUTCOMES: Record<
  string,
  { label: string; status: Status; event: string; detail: string }
> = {
  errored: {
    label: "Error recorded",
    status: "error",
    event: "wallet_errored",
    detail: "The last attempt ended with a recorded error.",
  },
  rejected: {
    label: "Rejection recorded",
    status: "error",
    event: "wallet_rejected",
    detail: "The last attempt ended with a recorded rejection.",
  },
  no_outcome_observed: {
    label: "No outcome recorded",
    status: "gap",
    event: "wallet_attempted, then no result event",
    detail:
      "Evidence gap: an attempt started and no result was recorded. It is not evidence of a rejection.",
  },
  pending: {
    label: "Waiting for the wallet",
    status: "neutral",
    event: "wallet_attempted within 60 s of the cutoff",
    detail:
      "The attempt was still inside the pending window at the data cutoff.",
  },
};
// Drawn even at zero so the error/evidence-gap distinction stays visible.
const ALWAYS_SHOWN = ["errored", "no_outcome_observed"];

function outcomeOf(session: Session): string {
  return session.attempt_states.at(-1) ?? "unknown";
}

// Every session follows exactly one path, so each column's counts add up.
export function sessionPath(session: Session): string[] {
  switch (session.cohort) {
    case "no_gate_event":
      return ["entry", "no_gate", "seg:browsers"];
    case "gate_event_no_attempt":
      return ["entry", "gate", "no_attempt", "seg:stalled_at_wallet"];
    case "attempted_no_success":
      return [
        "entry",
        "gate",
        "attempt",
        `outcome:${outcomeOf(session)}`,
        "seg:stalled_at_wallet",
      ];
    case "connected":
      return ["entry", "gate", "attempt", "connected", "seg:connected"];
  }
}

export function buildFlow(population: Session[]) {
  const states = new Set(ALWAYS_SHOWN);
  for (const session of population)
    if (session.cohort === "attempted_no_success")
      states.add(outcomeOf(session));
  const known = Object.keys(OUTCOMES);
  const outcomes = [...states].sort(
    (a, b) =>
      (known.includes(a) ? known.indexOf(a) : known.length) -
      (known.includes(b) ? known.indexOf(b) : known.length),
  );
  const nodes = new Map<string, FlowNode>();
  for (const node of STATIC) nodes.set(node.id, { ...node, members: [] });
  for (const state of outcomes)
    nodes.set(`outcome:${state}`, {
      id: `outcome:${state}`,
      column: 3,
      rule: 2,
      cohort: "attempted_no_success",
      ...(OUTCOMES[state] ?? {
        label: state,
        status: "neutral",
        event: state,
        detail: "Last attempt state as recorded.",
      }),
      members: [],
    });
  const pairs: [string, string][] = [
    ["entry", "no_gate"],
    ["entry", "gate"],
    ["gate", "attempt"],
    ["gate", "no_attempt"],
    ["attempt", "connected"],
    ...outcomes.map((s): [string, string] => ["attempt", `outcome:${s}`]),
    ["no_gate", "seg:browsers"],
    ["no_attempt", "seg:stalled_at_wallet"],
    ...outcomes.map((s): [string, string] => [
      `outcome:${s}`,
      "seg:stalled_at_wallet",
    ]),
    ["connected", "seg:connected"],
  ];
  const edges = new Map<string, FlowEdge>(
    pairs.map(([source, target]) => [
      `${source}|${target}`,
      { source, target, members: [] },
    ]),
  );
  for (const session of population) {
    const path = sessionPath(session);
    path.forEach((id, index) => {
      nodes.get(id)!.members.push(session);
      if (index) edges.get(`${path[index - 1]}|${id}`)!.members.push(session);
    });
  }
  return { nodes, edges: [...edges.values()], outcomes };
}

const NODE_W = 184;
const NODE_H = 102;
const COL_W = 248;
const ROW = 126;
const PAD = 24;
const TOP = 56;
const GROUP_HEAD = 40;

function layout(nodes: Map<string, FlowNode>, outcomes: string[]) {
  const at = new Map<string, { x: number; y: number }>();
  const put = (id: string, y: number) =>
    at.set(id, { x: PAD + nodes.get(id)!.column * COL_W, y });
  const row = (index: number) => TOP + index * ROW;
  // Row 0: left before the gate. Row 1: the recorded happy path. Below: stalls.
  for (const id of ["no_gate", "seg:browsers"]) put(id, row(0));
  for (const id of ["entry", "gate", "attempt", "connected", "seg:connected"])
    put(id, row(1));
  put("no_attempt", row(2));
  const groupTop = row(2) + NODE_H + 18;
  outcomes.forEach((state, index) =>
    put(`outcome:${state}`, groupTop + GROUP_HEAD + index * (NODE_H + 14)),
  );
  const last = at.get(`outcome:${outcomes.at(-1)}`)!.y;
  put("seg:stalled_at_wallet", (row(2) + last) / 2);
  const groupBottom = last + NODE_H + 12;
  return {
    at,
    group: { top: groupTop, bottom: groupBottom },
    width: PAD * 2 + (columns.length - 1) * COL_W + NODE_W,
    height: groupBottom + 16,
  };
}

function labelLines(label: string, limit = 18): string[] {
  const lines: string[] = [];
  for (const word of label.split(" ")) {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > limit) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return lines;
}

function StatusMark({ status }: { status: Status }) {
  const check = <path d="M-5.5 0.2l3.8 3.8 7-7.2" />;
  const bang = <path d="M0 -6v7.5M0 5.2v0.3" />;
  return (
    <g className={`flow-mark flow-mark-${status}`}>
      <circle r="11" />
      {status === "error" || status === "gap" ? (
        bang
      ) : status === "neutral" ? (
        <path d="M-4.5 0h9" />
      ) : status === "segment" ? (
        <circle className="flow-mark-dot" r="3.5" />
      ) : (
        check
      )}
    </g>
  );
}

const EXITS: Record<Session["exit_type"], string> = {
  not_now: "Not now",
  back: "Back to projects",
  inactive: "Went quiet",
  open: "Still open",
};

function facts(node: FlowNode): string[] {
  const k = node.members.length;
  if (!k) return [];
  const lines = [];
  const retried = node.members.filter((s) => s.after_retry).length;
  if (node.id === "connected" || node.id === "seg:connected")
    lines.push(`Connected after a retry: ${sessions(retried, k)}`);
  if (node.column >= 3) {
    const exits = Object.entries(EXITS)
      .map(
        ([key, label]) =>
          [
            label,
            node.members.filter((s) => s.exit_type === key).length,
          ] as const,
      )
      .filter(([, count]) => count)
      .map(([label, count]) => `${label} ${count}`);
    lines.push(`Exits: ${exits.join(" · ")}`);
  }
  const unknown = node.members.filter((s) => s.coverage === "unknown").length;
  lines.push(`Coverage unknown: ${sessions(unknown, k)}`);
  return lines;
}

// Offsets are fractions of the canvas size; z = 1 fills the canvas width.
// The default view is 90%, centred, so the diagram has a margin.
const FIT = { x: 0.05, y: 0.05, z: 0.8 };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;

const COHORT_NODE: Record<Cohort, string> = {
  no_gate_event: "no_gate",
  gate_event_no_attempt: "no_attempt",
  attempted_no_success: "rule2",
  connected: "connected",
};

export function CohortFlow({
  population,
  selected,
  personal,
  onSelect,
}: {
  population: Session[];
  selected: Cohort | null;
  personal: boolean;
  onSelect: (cohort: Cohort | null) => void;
}) {
  const uid = useId().replaceAll(":", "");
  const canvas = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  // Pan and zoom as a transform of the fitted diagram, in canvas pixels.
  const [view, setView] = useState(FIT);
  const viewRef = useRef(view);
  const drag = useRef<{
    x: number;
    y: number;
    from: typeof FIT;
    moved: boolean;
  }>(null);
  const [dragging, setDragging] = useState(false);
  const n = population.length;
  const { nodes, edges, outcomes } = buildFlow(population);
  const { at, group, width, height } = layout(nodes, outcomes);
  const rule2 = population.filter((s) => s.cohort === "attempted_no_success");

  // A node click selects its cohort; a card click elsewhere overrides the node.
  const focused = focus === "rule2" ? null : focus ? nodes.get(focus) : null;
  const active =
    focus &&
    (focused?.cohort ?? (focus === "rule2" ? "attempted_no_success" : null)) ===
      selected
      ? focus
      : selected
        ? COHORT_NODE[selected]
        : null;
  const activeMembers =
    active === "rule2"
      ? rule2
      : active
        ? (nodes.get(active)?.members ?? [])
        : [];
  const lit = new Set<string>(active && active !== "rule2" ? [active] : []);
  const litEdges = new Set<string>();
  for (const session of activeMembers) {
    const path = sessionPath(session);
    path.forEach((id, index) => {
      lit.add(id);
      if (index) litEdges.add(`${path[index - 1]}|${id}`);
    });
  }
  const activeLabel =
    active === "rule2"
      ? cohortInfo.attempted_no_success.label
      : active
        ? nodes.get(active)?.label
        : null;

  function choose(id: string, cohort: Cohort | null) {
    setHover(null);
    if (active === id) {
      setFocus(null);
      onSelect(null);
    } else {
      setFocus(id);
      onSelect(cohort);
    }
  }
  function show(id: string, element: Element) {
    const box = canvas.current;
    if (!box) return;
    const rect = element.getBoundingClientRect();
    const frame = box.getBoundingClientRect();
    const above = rect.bottom + 170 > frame.bottom;
    setHover({
      id,
      x: Math.min(
        Math.max(rect.left + rect.width / 2 - frame.left, 150),
        box.clientWidth - 150,
      ),
      y: (above ? rect.top : rect.bottom) - frame.top,
      above,
    });
  }
  const pressable = (id: string, cohort: Cohort | null) => ({
    role: "button",
    tabIndex: 0,
    "aria-pressed": active === id,
    onClick: () => choose(id, cohort),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(id, cohort);
      }
    },
    onMouseEnter: (event: React.MouseEvent) => show(id, event.currentTarget),
    onFocus: (event: React.FocusEvent) => show(id, event.currentTarget),
    onMouseLeave: () => setHover(null),
    onBlur: () => setHover(null),
  });

  // Spread a node's edge ends along its side so branches leave separately.
  const ports = new Map<string, number>();
  for (const [side, key] of [
    ["source", "target"],
    ["target", "source"],
  ] as const) {
    const byNode = new Map<string, FlowEdge[]>();
    for (const edge of edges)
      byNode.set(edge[side], [...(byNode.get(edge[side]) ?? []), edge]);
    for (const [id, list] of byNode) {
      list.sort((a, b) => at.get(a[key])!.y - at.get(b[key])!.y);
      const step = Math.min(12, 44 / Math.max(1, list.length - 1));
      list.forEach((edge, index) =>
        ports.set(
          `${side}:${edge.source}|${edge.target}|${id}`,
          (index - (list.length - 1) / 2) * step,
        ),
      );
    }
  }
  function route(edge: FlowEdge): string {
    const from = at.get(edge.source)!;
    const to = at.get(edge.target)!;
    const key = `${edge.source}|${edge.target}`;
    const sx = from.x + NODE_W;
    const sy = from.y + NODE_H / 2 + ports.get(`source:${key}|${edge.source}`)!;
    const tx = to.x - 3;
    const ty = to.y + NODE_H / 2 + ports.get(`target:${key}|${edge.target}`)!;
    const span =
      nodes.get(edge.target)!.column - nodes.get(edge.source)!.column;
    if (span > 1 && Math.abs(sy - ty) > 1) {
      // Bend in the first gap, then run along the empty row to the target.
      const bend = from.x + COL_W;
      const mid = (sx + bend) / 2;
      return `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${bend} ${ty} L ${tx} ${ty}`;
    }
    const mid = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`;
  }

  // Keep at least a strip of the diagram inside the canvas.
  function place(next: typeof FIT): typeof FIT {
    const box = canvas.current;
    if (!box) return next;
    // Keep at least 80px of the diagram inside the canvas.
    const kx = 80 / (box.clientWidth || 1);
    const ky = 80 / (box.clientHeight || 1);
    return {
      z: next.z,
      x: Math.min(1 - kx, Math.max(kx - next.z, next.x)),
      y: Math.min(1 - ky, Math.max(ky - next.z, next.y)),
    };
  }
  function move(next: typeof FIT) {
    viewRef.current = next;
    setView(next);
    setHover(null);
  }
  function zoomTo(next: number, point?: { x: number; y: number }): boolean {
    const box = canvas.current;
    const from = viewRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (!box || Math.abs(z - from.z) < 0.001) return false;
    const px = point ? point.x / (box.clientWidth || 1) : 0.5;
    const py = point ? point.y / (box.clientHeight || 1) : 0.5;
    // The diagram point under (px, py) stays there.
    move(
      place({
        z,
        x: px - ((px - from.x) * z) / from.z,
        y: py - ((py - from.y) * z) / from.z,
      }),
    );
    return true;
  }
  // A non-passive listener, so the wheel zooms the diagram instead of the page
  // (the page still scrolls once the zoom is at its limit).
  useEffect(() => {
    const box = canvas.current;
    if (!box) return;
    function wheel(event: WheelEvent) {
      if (!box || !event.deltaY) return;
      const lines =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? box.clientHeight
            : 1;
      const frame = box.getBoundingClientRect();
      if (
        zoomTo(viewRef.current.z * Math.exp(-event.deltaY * lines * 0.0015), {
          x: event.clientX - frame.left,
          y: event.clientY - frame.top,
        })
      )
        event.preventDefault();
    }
    box.addEventListener("wheel", wheel, { passive: false });
    return () => box.removeEventListener("wheel", wheel);
    // zoomTo only reads refs and state setters.
  }, []);

  const hovered =
    hover?.id === "rule2" ? null : hover ? nodes.get(hover.id) : null;
  const tooltipId = `${uid}-tip`;

  return (
    <div className="flow">
      <div className="flow-stage">
        <div
          ref={canvas}
          className={`flow-canvas${dragging ? " is-dragging" : ""}`}
          style={{ aspectRatio: `${width} / ${height}` }}
          tabIndex={0}
          role="region"
          aria-label="Recorded workflow diagram. Zoom with the mouse wheel or the plus and minus keys, drag to move it, and press 0 to reset."
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const next =
              event.key === "+" || event.key === "="
                ? viewRef.current.z * ZOOM_STEP
                : event.key === "-" || event.key === "_"
                  ? viewRef.current.z / ZOOM_STEP
                  : null;
            if (event.key === "0") {
              event.preventDefault();
              move(FIT);
            } else if (next !== null) {
              event.preventDefault();
              zoomTo(next);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              from: viewRef.current,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const box = canvas.current;
            const start = drag.current;
            if (!box || !start || !(event.buttons & 1)) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!start.moved) {
              if (Math.hypot(dx, dy) < 4) return;
              start.moved = true;
              box.setPointerCapture?.(event.pointerId);
              setDragging(true);
            }
            move(
              place({
                ...start.from,
                x: start.from.x + dx / (box.clientWidth || 1),
                y: start.from.y + dy / (box.clientHeight || 1),
              }),
            );
          }}
          onPointerUp={() => {
            setDragging(false);
            // Keep the flag until the click that ends a drag is swallowed.
            if (!drag.current?.moved) drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onClickCapture={(event) => {
            if (drag.current?.moved) {
              event.stopPropagation();
              event.preventDefault();
            }
            drag.current = null;
          }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{
              transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.z})`,
            }}
            role="group"
            aria-label={`Recorded workflow from ${sessions(n, n)} to four cohorts and three segments.${activeLabel ? ` ${personal ? "Your session cohort" : "Highlighted"}: ${activeLabel}.` : ""}`}
          >
            <defs>
              {["normal", "warn", "active"].map((tone) => (
                <marker
                  key={tone}
                  id={`${uid}-${tone}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path
                    className={`flow-arrow flow-arrow-${tone}`}
                    d="M 0 0 L 10 5 L 0 10 z"
                  />
                </marker>
              ))}
              <filter
                id={`${uid}-shadow`}
                x="-10%"
                y="-10%"
                width="120%"
                height="140%"
              >
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="3"
                  floodColor="#0f172a"
                  floodOpacity="0.07"
                />
              </filter>
            </defs>
            {columns.map((label, index) => (
              <g key={label}>
                {index > 0 && (
                  <line
                    className="flow-column-rule"
                    x1={PAD + index * COL_W - (COL_W - NODE_W) / 2}
                    x2={PAD + index * COL_W - (COL_W - NODE_W) / 2}
                    y1={10}
                    y2={height - 10}
                  />
                )}
                <text
                  className="flow-column-label"
                  x={PAD + index * COL_W + 2}
                  y={30}
                >
                  {label.toUpperCase()}
                </text>
              </g>
            ))}
            <g
              className={`flow-group${active === "rule2" ? " is-selected" : ""}${active && active !== "rule2" && !rule2.some((s) => activeMembers.includes(s)) ? " is-dim" : ""}`}
              {...pressable("rule2", "attempted_no_success")}
              aria-label={`Rule 2, ${cohortInfo.attempted_no_success.label}: ${sessions(rule2.length, n)}. ${cohortInfo.attempted_no_success.description}`}
            >
              <rect
                x={PAD + 3 * COL_W - 12}
                y={group.top}
                width={NODE_W + 24}
                height={group.bottom - group.top}
                rx="14"
              />
              <text
                className="flow-group-rule"
                x={PAD + 3 * COL_W + 2}
                y={group.top + 17}
              >
                RULE 2 · {sessions(rule2.length, n)}
              </text>
              <text
                className="flow-group-label"
                x={PAD + 3 * COL_W + 2}
                y={group.top + 33}
              >
                {cohortInfo.attempted_no_success.label}
              </text>
            </g>
            {edges.map((edge) => {
              const key = `${edge.source}|${edge.target}`;
              const target = nodes.get(edge.target)!;
              const warn = target.status === "error" || target.status === "gap";
              const on = litEdges.has(key);
              const near =
                hover && (edge.source === hover.id || edge.target === hover.id);
              const tone = on
                ? "active"
                : warn && edge.members.length
                  ? "warn"
                  : "normal";
              return (
                <path
                  key={key}
                  className={`flow-edge flow-edge-${tone}${edge.members.length ? "" : " is-empty"}${near ? " is-near" : ""}${active && !on ? " is-dim" : ""}`}
                  d={route(edge)}
                  strokeWidth={
                    edge.members.length
                      ? 1.5 + (4 * edge.members.length) / Math.max(1, n)
                      : 1.2
                  }
                  markerEnd={`url(#${uid}-${tone})`}
                >
                  <title>{`${nodes.get(edge.source)!.label} → ${target.label}: ${sessions(edge.members.length, n)}`}</title>
                </path>
              );
            })}
            {[...nodes.values()].map((node) => {
              const { x, y } = at.get(node.id)!;
              const retried = node.members.filter((s) => s.after_retry).length;
              const note =
                node.status === "gap"
                  ? "Evidence gap"
                  : node.id === "connected" && retried
                    ? `${retried} after a retry`
                    : null;
              const lines = labelLines(node.label).slice(0, 2);
              return (
                <g
                  key={node.id}
                  transform={`translate(${x}, ${y})`}
                  data-segment={node.segment}
                  className={`flow-node flow-node-${node.status}${active === node.id ? " is-selected" : ""}${active && !lit.has(node.id) ? " is-dim" : ""}${hover?.id === node.id ? " is-hover" : ""}`}
                  {...pressable(node.id, node.cohort)}
                  aria-label={`${node.rule ? `Rule ${node.rule}, ` : ""}${node.label}: ${sessions(node.members.length, n)}. ${node.detail}`}
                  aria-describedby={
                    hover?.id === node.id ? tooltipId : undefined
                  }
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="10"
                    filter={`url(#${uid}-shadow)`}
                  />
                  <g transform="translate(26, 24)">
                    <StatusMark status={node.status} />
                  </g>
                  {note && (
                    <text className="flow-node-note" x="44" y="28">
                      {note}
                    </text>
                  )}
                  {node.rule && (
                    <text
                      className="flow-node-rule"
                      x={NODE_W - 14}
                      y="28"
                      textAnchor="end"
                    >
                      RULE {node.rule}
                    </text>
                  )}
                  <text
                    className="flow-node-label"
                    x="16"
                    y={lines.length > 1 ? 56 : 64}
                  >
                    {lines.map((line, index) => (
                      <tspan key={index} x="16" dy={index ? 18 : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  <text className="flow-node-count" x="16" y={NODE_H - 13}>
                    {sessions(node.members.length, n)}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover && !dragging && (
            <div
              id={tooltipId}
              role="tooltip"
              className={`flow-tooltip${hover.above ? " is-above" : ""}`}
              style={{ left: hover.x, top: hover.y }}
            >
              {hovered ? (
                <>
                  <strong>
                    {hovered.rule ? `Rule ${hovered.rule} · ` : ""}
                    {hovered.label}
                  </strong>
                  <span className="flow-tooltip-count">
                    {sessions(hovered.members.length, n)}
                  </span>
                  <code>{hovered.event}</code>
                  <p>{hovered.detail}</p>
                  {facts(hovered).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </>
              ) : (
                <>
                  <strong>
                    Rule 2 · {cohortInfo.attempted_no_success.label}
                  </strong>
                  <span className="flow-tooltip-count">
                    {sessions(rule2.length, n)}
                  </span>
                  <p>{cohortInfo.attempted_no_success.description}</p>
                  <span>Split by each session’s last attempt state.</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flow-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={view.z <= MIN_ZOOM}
            onClick={() => zoomTo(view.z / ZOOM_STEP)}
          >
            −
          </button>
          <button
            type="button"
            className="flow-zoom-level"
            aria-label={`Zoom ${Math.round(view.z * 100)}%. Reset view`}
            title="Reset view (0)"
            disabled={view === FIT}
            onClick={() => move(FIT)}
          >
            {Math.round(view.z * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={view.z >= MAX_ZOOM}
            onClick={() => zoomTo(view.z * ZOOM_STEP)}
          >
            +
          </button>
        </div>
      </div>
      {n === 0 && (
        <p className="flow-empty">
          No recorded sessions in this population yet.
        </p>
      )}
      <div className="flow-footer">
        <ul className="flow-legend" aria-label="Legend">
          {(
            [
              ["normal", "Recorded event"],
              ["success", "Connected"],
              ["error", "Error recorded"],
              ["gap", "Evidence gap: no result event"],
              ["neutral", "No further event recorded"],
            ] as const
          ).map(([status, label]) => (
            <li key={status}>
              <svg viewBox="-12 -12 24 24" aria-hidden="true">
                <StatusMark status={status} />
              </svg>
              {label}
            </li>
          ))}
        </ul>
        <p className="flow-status" role="status">
          {activeLabel
            ? `${personal ? "Your session cohort" : "Highlighted"}: ${activeLabel} · ${sessions(activeMembers.length, n)}. Select it again to clear.`
            : "Showing all four cohorts and three segments."}
        </p>
      </div>
    </div>
  );
}
