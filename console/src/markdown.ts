// The report document's Markdown subset (engine/report_doc.py checks the same rules):
// #–### headings, paragraphs, - and 1. lists, tables, > [!NOTE]/[!WARNING] callouts,
// **bold**, *italic*, `code` and [fact:<id>] citations. Nothing becomes HTML: every
// node renders as text, so a document cannot inject markup or links.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "cite"; id: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; id: string; text: string; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "callout"; kind: "note" | "warning"; blocks: Block[] }
  | { t: "hr" };

const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[fact:([a-z0-9_]+)\]/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined)
      out.push({ t: "strong", c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: "em", c: parseInline(m[3]) });
    else out.push({ t: "cite", id: m[4] });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ t: "text", v: source.slice(last) });
  return out;
}

export function plainText(inlines: Inline[]): string {
  return inlines
    .map((n) =>
      n.t === "text" || n.t === "code"
        ? n.v
        : n.t === "cite"
          ? ""
          : plainText(n.c),
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// Stable anchors for the fixed outline; older report links (#findings, #gaps…) still land.
const SECTION_IDS: Record<string, string> = {
  "Executive Summary": "summary",
  "1. Investigation Scope": "scope",
  "2. Observed User Behavior": "observed",
  "3. Hypothesis Findings": "findings",
  "4. Evidence Gaps": "gaps",
  "5. Recommended Actions": "next-action",
  "6. Limitations": "limitations",
  Appendix: "appendix",
};

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

const CELLS = (line: string) =>
  line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
const TABLE_RULE = /^\|[\s:|-]+\|$/;
const LIST_ITEM = /^(?:([-*])|(\d+)\.)\s+(.*)$/;

export function parseMarkdown(
  source: string,
  used = new Set<string>(),
): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      const text = heading[2].trim();
      const c = parseInline(text);
      const plain = plainText(c);
      blocks.push({
        t: "h",
        level,
        text: plain,
        c,
        id: unique(
          level === 2 && SECTION_IDS[plain] ? SECTION_IDS[plain] : slug(plain),
        ),
      });
      i++;
      continue;
    }
    if (line === "---") {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">"))
        inner.push(lines[i++].trim().replace(/^>\s?/, ""));
      const marker = /^\[!(NOTE|WARNING)\]$/.exec(inner[0] ?? "");
      blocks.push({
        t: "callout",
        kind: marker?.[1] === "WARNING" ? "warning" : "note",
        blocks: parseMarkdown(inner.slice(marker ? 1 : 0).join("\n"), used),
      });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|"))
        rows.push(lines[i++].trim());
      const hasHead = rows.length > 1 && TABLE_RULE.test(rows[1]);
      blocks.push({
        t: "table",
        head: hasHead ? CELLS(rows[0]) : [],
        rows: rows
          .slice(hasHead ? 2 : 0)
          .filter((r) => !TABLE_RULE.test(r))
          .map(CELLS),
      });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const next = LIST_ITEM.exec(lines[i].trim());
        if (!next || (next[2] !== undefined) !== ordered) break;
        items.push(parseInline(next[3]));
        i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^(#{1,3}\s|>|\||---$)/.test(next) || LIST_ITEM.test(next))
        break;
      para.push(next);
      i++;
    }
    blocks.push({ t: "p", c: parseInline(para.join(" ")) });
  }
  return blocks;
}

// Every citation in reading order: the first appearance of a fact sets its number.
export function citationOrder(blocks: Block[]): string[] {
  const order: string[] = [];
  const visit = (inlines: Inline[]) =>
    inlines.forEach((n) => {
      if (n.t === "cite") {
        if (!order.includes(n.id)) order.push(n.id);
      } else if (n.t === "strong" || n.t === "em") visit(n.c);
    });
  const walk = (list: Block[]) =>
    list.forEach((b) => {
      if (b.t === "h" || b.t === "p") visit(b.c);
      else if (b.t === "ul" || b.t === "ol") b.items.forEach(visit);
      else if (b.t === "table") [b.head, ...b.rows].flat().forEach(visit);
      else if (b.t === "callout") walk(b.blocks);
    });
  walk(blocks);
  return order;
}
