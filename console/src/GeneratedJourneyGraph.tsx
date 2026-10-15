import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { safeText, sessions } from "./format";
import type { JourneyComparison } from "./journeySpecs";

export default function GeneratedJourneyGraph({
  value,
}: {
  value: JourneyComparison;
}) {
  const { nodes, edges } = useMemo(() => {
    const rows = new Map<number, number>();
    const nodes: Node[] = value.nodes.map((node) => {
      const row = rows.get(node.column) ?? 0;
      rows.set(node.column, row + 1);
      return {
        id: node.id,
        position: { x: node.column * 250, y: row * 110 },
        data: {
          label: (
            <>
              <strong title={safeText(node.label)}>
                {safeText(node.label)}
              </strong>
              {node.ref_check === "wrong" && (
                <span title={node.ref_note ?? undefined}>
                  Code reference needs review
                </span>
              )}
              {node.ref_check === "partial" && (
                <span title={node.ref_note ?? undefined}>
                  Partially checked reference
                </span>
              )}
              {!value.code_only &&
                node.sessions !== undefined &&
                node.total_sessions !== undefined && (
                  <span>{sessions(node.sessions, node.total_sessions)}</span>
                )}
            </>
          ),
        },
        style: {
          width: 220,
          borderRadius: 12,
          padding: 14,
          borderColor: node.id.startsWith("segment:") ? "#2158f2" : "#dce4ef",
        },
        sourcePosition: "right" as Node["sourcePosition"],
        targetPosition: "left" as Node["targetPosition"],
      };
    });
    const edges: Edge[] = value.edges.map((edge) => ({
      ...edge,
      label:
        !value.code_only &&
        edge.sessions !== undefined &&
        edge.total_sessions !== undefined
          ? sessions(edge.sessions, edge.total_sessions)
          : undefined,
      style: value.code_only
        ? { strokeDasharray: "5 4" }
        : { stroke: "#8da8f4" },
    }));
    return { nodes, edges };
  }, [value]);
  return (
    <div className="generated-graph" aria-label="Generated journey structure">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        defaultViewport={{ x: 20, y: 20, zoom: 0.8 }}
        minZoom={0.15}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
