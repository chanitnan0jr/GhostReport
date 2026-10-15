import { expect, it } from "vitest";
import document from "../../fixtures/report.document.sample.json";
import { citationOrder, parseInline, parseMarkdown } from "./markdown";

it("parses the engine's document into the fixed outline with stable anchors", () => {
  const blocks = parseMarkdown(document.markdown);
  const sections = blocks.filter((b) => b.t === "h" && b.level === 2);
  expect(sections.map((b) => (b.t === "h" ? [b.text, b.id] : null))).toEqual([
    ["Executive Summary", "summary"],
    ["1. Investigation Scope", "scope"],
    ["2. Observed User Behavior", "observed"],
    ["3. Hypothesis Findings", "findings"],
    ["4. Evidence Gaps", "gaps"],
    ["5. Recommended Actions", "next-action"],
    ["6. Limitations", "limitations"],
    ["Appendix", "appendix"],
  ]);
  expect(blocks.some((b) => b.t === "table")).toBe(true);
  expect(blocks.find((b) => b.t === "callout")).toMatchObject({ kind: "note" });
  const ids = new Set(document.facts.map((f) => f.id));
  const cited = citationOrder(blocks);
  expect(cited[0]).toBe("population");
  expect(cited.every((id) => ids.has(id))).toBe(true);
});

it("keeps markup as text and reads citations, code and emphasis", () => {
  expect(
    parseInline('**H1** <img src=x onerror="alert(1)"> `a|b` *q* [fact:x_1]'),
  ).toEqual([
    { t: "strong", c: [{ t: "text", v: "H1" }] },
    { t: "text", v: ' <img src=x onerror="alert(1)"> ' },
    { t: "code", v: "a|b" },
    { t: "text", v: " " },
    { t: "em", c: [{ t: "text", v: "q" }] },
    { t: "text", v: " " },
    { t: "cite", id: "x_1" },
  ]);
  const [callout] = parseMarkdown("> [!WARNING]\n> - one\n> - two");
  expect(callout).toMatchObject({
    t: "callout",
    kind: "warning",
    blocks: [{ t: "ul", items: [[{ v: "one" }], [{ v: "two" }]] }],
  });
  const [table] = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
  expect(table).toMatchObject({
    t: "table",
    rows: [[[{ v: "1" }], [{ v: "2" }]]],
  });
});
