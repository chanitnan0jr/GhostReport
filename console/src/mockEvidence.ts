import type { EvidenceGraph, EvidenceNode } from "./evidence";
import type { Report } from "./types";

export function mockEvidence(report: Report): EvidenceGraph {
  const nodes = new Map<string, EvidenceNode>();
  const edges: EvidenceGraph["edges"] = [];
  const facts = [
    ...report.workflow.states,
    ...report.workflow.outcomes,
    ...report.workflow.ui_facts,
  ];
  const add = (node: EvidenceNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const segmentOf = {
    no_gate_event: ["browsers", "Left before the wallet gate"],
    gate_event_no_attempt: ["stalled_at_wallet", "Stopped at the wallet"],
    attempted_no_success: ["stalled_at_wallet", "Stopped at the wallet"],
    connected: ["connected", "Connected"],
  } as const;
  for (const hypothesis of report.hypotheses) {
    const rows = report.current.findings.filter(
      (finding) => finding.hypothesis_id === hypothesis.id,
    );
    const current = [
      ...new Set(
        rows
          .filter((finding) => finding.respondents > 0)
          .map((finding) => finding.self_report),
      ),
    ];
    add({
      id: `h:${hypothesis.id}`,
      column: 1,
      kind: "hypothesis",
      label: hypothesis.id,
      statement: hypothesis.statement,
      approved_class: hypothesis.class_id,
      generic: hypothesis.generic,
      v1: "Unresolved (locked before probe evidence)",
      current: current.length ? current : ["Unresolved"],
    });
    for (const id of hypothesis.code_evidence) {
      const fact = facts.find((item) => item.id === id);
      if (!fact) continue;
      add({
        id: `code:${id}`,
        column: 0,
        kind: "code",
        label: id,
        desc: fact.desc,
        file: fact.code_ref.file,
        lines: fact.code_ref.lines,
        quote: fact.code_ref.quote,
        instrumentation: fact.instrumentation,
        permalink: null,
      });
      edges.push({
        source: `code:${id}`,
        target: `h:${hypothesis.id}`,
        relation: "cited by",
      });
    }
    for (const finding of rows) {
      const id = `f:${finding.decision_point}:${hypothesis.id}`;
      add({
        id,
        column: 3,
        kind: "finding",
        label: `${hypothesis.id} at ${finding.decision_point}`,
        decision_point: finding.decision_point,
        cohort: finding.cohort,
        selected: finding.selected,
        respondents: finding.respondents,
        by_source: finding.by_source,
        self_report: finding.self_report,
        observation: finding.observation,
        text: finding.text,
      });
      const [segment, label] = segmentOf[finding.cohort];
      add({ id: `s:${segment}`, column: 4, kind: "segment", label, segment });
      edges.push(
        { source: `h:${hypothesis.id}`, target: id, relation: "self-report" },
        { source: id, target: `s:${segment}`, relation: "asked in" },
      );
    }
  }
  const highlight: Record<string, string[]> = {};
  for (const hypothesis of report.hypotheses) {
    const id = `h:${hypothesis.id}`;
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const source = queue.pop();
      for (const edge of edges.filter((edge) => edge.source === source)) {
        if (!seen.has(edge.target)) {
          seen.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    edges
      .filter((edge) => edge.target === id)
      .forEach((edge) => seen.add(edge.source));
    highlight[id] = [...seen].sort();
  }
  return {
    columns: [
      "Code evidence",
      "Hypotheses",
      "Answer options and rules",
      "Findings",
      "Segment",
    ].map((label, index) => ({ label, index })),
    nodes: [...nodes.values()].sort(
      (a, b) => a.column - b.column || a.id.localeCompare(b.id),
    ),
    edges,
    highlight,
    notes: [
      "Mock evidence links use only the shared report fixture. Approved answer-option and rule links are absent in that fixture; this preview leaves those links empty.",
    ],
  };
}
