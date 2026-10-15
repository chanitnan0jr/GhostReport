import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { safeText, time } from "./format";
import {
  citationOrder,
  parseMarkdown,
  type Block,
  type Inline,
} from "./markdown";
import {
  useReportDocument,
  type DocFact,
  type FactEvidence,
  type ReportDocument,
} from "./reportDocument";
import type { Report } from "./types";
import { useJudgeSession } from "./useJudgeSession";
import { YourSession } from "./YourSession";
import "./InvestigationDocument.css";

const MODE: Record<string, [string, string]> = {
  seed: [
    "SEED DATA",
    "Demonstration dataset. These are not live participant results.",
  ],
  demo: ["DEMO", "Prepared investigation + recorded activity"],
  replay: ["REPLAY", "Recorded run. This is not a live investigation."],
};
const EVIDENCE: Record<FactEvidence, string> = {
  observed: "Recorded by the app",
  self_report: "Self-reported answer",
  probe: "Exit question delivery",
  code: "Code evidence",
  run: "Run verification",
  plan: "Locked plan",
};
const K_OF_N = /\b(\d+) of (\d+) (?:[a-z_]+ )?(respondents?|sessions?)\b/gi;

interface Cite {
  number: number;
  fact?: DocFact;
  sections: string[];
}

// Re-checks on the client what the engine already checked: every citation resolves, every
// "k of n" next to a citation is one of the cited facts' pairs, and no rendered text trips
// the wording guard.
function audit(blocks: Block[], facts: Map<string, DocFact>) {
  let cites = 0;
  let resolved = 0;
  let counts = 0;
  let traced = 0;
  let withheld = 0;
  const unit = (inlines: Inline[]) => {
    const ids: string[] = [];
    let text = "";
    const walk = (list: Inline[]) =>
      list.forEach((n) => {
        if (n.t === "cite") ids.push(n.id);
        else if (n.t === "text") {
          text += n.v;
          if (safeText(n.v) !== n.v) withheld++;
        } else if (n.t === "code") text += " ";
        else walk(n.c);
      });
    walk(inlines);
    cites += ids.length;
    const cited = ids.map((id) => facts.get(id)).filter((f) => f !== undefined);
    resolved += cited.length;
    for (const m of text.matchAll(K_OF_N)) {
      counts++;
      const want = m[3].toLowerCase().startsWith("respondent")
        ? "respondents"
        : "sessions";
      if (
        cited.some((f) =>
          f.pairs.some(
            ([k, n, u]) =>
              k === Number(m[1]) && n === Number(m[2]) && u === want,
          ),
        )
      )
        traced++;
    }
  };
  const visit = (list: Block[]) =>
    list.forEach((b) => {
      if (b.t === "h" || b.t === "p") unit(b.c);
      else if (b.t === "ul" || b.t === "ol") b.items.forEach(unit);
      else if (b.t === "table") {
        b.head.forEach(unit);
        b.rows.forEach((row) => unit(row.flat()));
      } else if (b.t === "callout") visit(b.blocks);
    });
  visit(blocks);
  return { cites, resolved, counts, traced, withheld };
}

function citeIndex(blocks: Block[], facts: Map<string, DocFact>) {
  const index = new Map<string, Cite>();
  citationOrder(blocks).forEach((id, i) =>
    index.set(id, { number: i + 1, fact: facts.get(id), sections: [] }),
  );
  let section = "";
  const visit = (inlines: Inline[]) =>
    inlines.forEach((n) => {
      if (n.t === "cite") {
        const entry = index.get(n.id);
        if (entry && !entry.sections.includes(section))
          entry.sections.push(section);
      } else if (n.t === "strong" || n.t === "em") visit(n.c);
    });
  const walk = (list: Block[]) =>
    list.forEach((b) => {
      if (b.t === "h" && b.level === 2) section = b.text;
      if (b.t === "h" || b.t === "p") visit(b.c);
      else if (b.t === "ul" || b.t === "ol") b.items.forEach(visit);
      else if (b.t === "table") [b.head, ...b.rows].flat().forEach(visit);
      else if (b.t === "callout") walk(b.blocks);
    });
  walk(blocks);
  return index;
}

function Inlines({
  nodes,
  cites,
  active,
  onCite,
}: {
  nodes: Inline[];
  cites: Map<string, Cite>;
  active: string | null;
  onCite: (id: string, from: HTMLElement) => void;
}): ReactNode {
  return nodes.map((n, i) => {
    if (n.t === "text") return <Fragment key={i}>{safeText(n.v)}</Fragment>;
    if (n.t === "code") return <code key={i}>{n.v}</code>;
    if (n.t === "strong")
      return (
        <strong key={i}>
          <Inlines nodes={n.c} cites={cites} active={active} onCite={onCite} />
        </strong>
      );
    if (n.t === "em")
      return (
        <em key={i}>
          <Inlines nodes={n.c} cites={cites} active={active} onCite={onCite} />
        </em>
      );
    const cite = cites.get(n.id);
    if (!cite?.fact)
      return (
        <span
          key={i}
          className="doc-cite is-missing"
          title={`Unknown fact ${n.id}`}
        >
          ?
        </span>
      );
    return (
      <button
        key={i}
        type="button"
        className="doc-cite"
        data-fact={n.id}
        aria-pressed={active === n.id}
        aria-label={`Evidence ${cite.number}: ${cite.fact.label}`}
        title={cite.fact.statement}
        onClick={(event) => onCite(n.id, event.currentTarget)}
      >
        {cite.number}
      </button>
    );
  });
}

function Blocks(props: {
  blocks: Block[];
  cites: Map<string, Cite>;
  active: string | null;
  onCite: (id: string, from: HTMLElement) => void;
}): ReactNode {
  const { blocks, ...rest } = props;
  const inl = (nodes: Inline[]) => <Inlines nodes={nodes} {...rest} />;
  return blocks.map((b, i) => {
    switch (b.t) {
      case "h": {
        const Tag = b.level === 2 ? "h2" : "h3";
        return (
          <Tag key={i} id={b.id}>
            {inl(b.c)}
          </Tag>
        );
      }
      case "p":
        return <p key={i}>{inl(b.c)}</p>;
      case "ul":
      case "ol": {
        const Tag = b.t;
        return (
          <Tag key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inl(item)}</li>
            ))}
          </Tag>
        );
      }
      case "table":
        return (
          <div key={i} className="doc-table">
            <table>
              {b.head.length > 0 && (
                <thead>
                  <tr>
                    {b.head.map((cell, j) => (
                      <th key={j} scope="col">
                        {inl(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {b.rows.map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>{inl(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "callout":
        return (
          <aside
            key={i}
            className={`doc-callout is-${b.kind}`}
            aria-label={b.kind === "warning" ? "Limitations" : "Note"}
          >
            <Blocks blocks={b.blocks} {...rest} />
          </aside>
        );
      case "hr":
        return <hr key={i} />;
    }
  });
}

function value(data: unknown): string {
  if (data === null || data === undefined || data === "") return "None";
  if (typeof data === "boolean") return data ? "Yes" : "No";
  if (Array.isArray(data))
    return data.length ? data.map((d) => value(d)).join(", ") : "None";
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (
      entries.every(
        ([, v]) =>
          v && typeof v === "object" && "selected" in v && "respondents" in v,
      )
    )
      return entries
        .map(([k, v]) => {
          const pair = v as { selected: number; respondents: number };
          return `${k === "visitor" ? "visitors" : k} ${pair.selected} of ${pair.respondents}`;
        })
        .join(", ");
    return entries.map(([k, v]) => `${k} ${value(v)}`).join(", ");
  }
  return String(data);
}
const HIDDEN = new Set([
  "session_ids",
  "statement",
  "stem",
  "desc",
  "searched_files",
]);

function Inspector({
  fact,
  cite,
  facts,
  onSelect,
  onClose,
}: {
  fact: DocFact;
  cite?: Cite;
  facts: Map<string, DocFact>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [fact.id]);
  const long = (["session_ids", "searched_files"] as const)
    .map((key) => [key, fact.data[key]] as const)
    .filter(([, v]) => Array.isArray(v) && v.length > 0) as [
    string,
    string[],
  ][];
  const quoted = fact.data.statement ?? fact.data.stem;
  return (
    <section className="doc-inspector" aria-labelledby="doc-inspector-title">
      <header>
        <span className={`doc-evidence is-${fact.evidence}`}>
          {EVIDENCE[fact.evidence] ?? fact.evidence}
        </span>
        <button
          type="button"
          className="doc-close"
          aria-label="Close evidence inspector"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <h2 id="doc-inspector-title" ref={heading} tabIndex={-1}>
        {cite && <span className="doc-cite is-static">{cite.number}</span>}
        {safeText(fact.label)}
      </h2>
      <p className="doc-inspector-statement">{safeText(fact.statement)}</p>
      {typeof quoted === "string" && quoted && fact.kind !== "hypothesis" && (
        <blockquote>{safeText(quoted)}</blockquote>
      )}
      {fact.pairs[0] && fact.pairs[0][1] > 0 && (
        // The headline count; the fact's other counts are listed below by name.
        <p className="doc-pairs">
          <strong>
            {fact.pairs[0][0]} of {fact.pairs[0][1]}
          </strong>{" "}
          {fact.pairs[0][2]}
        </p>
      )}
      <dl className="doc-data">
        {Object.entries(fact.data)
          .filter(([key]) => !HIDDEN.has(key))
          .map(([key, v]) => (
            <div key={key}>
              <dt>{key.replace(/_/g, " ")}</dt>
              <dd>{safeText(value(v))}</dd>
            </div>
          ))}
      </dl>
      {long.map(([key, list]) => (
        <details key={key} className="doc-list">
          <summary>
            {key === "session_ids" ? "Sessions" : "Searched files"} (
            {list.length})
          </summary>
          <ul>
            {list.map((item) => (
              <li key={item}>
                <code>{item}</code>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {fact.refs.length > 0 && (
        <div className="doc-refs">
          <h3>Code references</h3>
          {fact.refs.map((ref, i) => (
            <figure key={i}>
              <figcaption>
                <code>
                  {ref.file}:{ref.lines[0]}
                  {ref.lines[1] && ref.lines[1] !== ref.lines[0]
                    ? `–${ref.lines[1]}`
                    : ""}
                </code>
              </figcaption>
              {ref.quote && <pre>{ref.quote}</pre>}
            </figure>
          ))}
        </div>
      )}
      {fact.related.some((id) => facts.has(id)) && (
        <div className="doc-related">
          <h3>Related facts</h3>
          {fact.related
            .filter((id) => facts.has(id))
            .map((id) => (
              <button key={id} type="button" onClick={() => onSelect(id)}>
                {safeText(facts.get(id)!.label)}
              </button>
            ))}
        </div>
      )}
      <dl className="doc-source">
        <div>
          <dt>Source</dt>
          <dd>
            <code>{fact.source}</code>
          </dd>
        </div>
        <div>
          <dt>Fact ID</dt>
          <dd>
            <code>fact:{fact.id}</code>
          </dd>
        </div>
        {cite && (
          <div>
            <dt>Cited in</dt>
            <dd>{cite.sections.join(", ")}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Details({
  doc,
  report,
  checks,
  updatedAt,
  refreshError,
}: {
  doc: ReportDocument;
  report: Report;
  checks: ReturnType<typeof audit>;
  updatedAt: string | null;
  refreshError: boolean;
}) {
  const lock = doc.facts.find((f) => f.id === "lock_v1")?.data;
  const rows: [string, boolean, string][] = [
    [
      "Engine fact check",
      doc.source === "llm" || doc.rejected.length === 0,
      doc.source === "llm"
        ? "AI draft passed"
        : doc.rejected.length
          ? `AI draft rejected (${doc.rejected.length} problems); template shown`
          : "Deterministic template",
    ],
    [
      "Citations resolved",
      checks.resolved === checks.cites,
      `${checks.resolved} of ${checks.cites}`,
    ],
    [
      "Counts traced to cited facts",
      checks.traced === checks.counts,
      `${checks.traced} of ${checks.counts}`,
    ],
    [
      "Wording guard",
      checks.withheld === 0,
      checks.withheld ? `${checks.withheld} withheld` : "Passed",
    ],
  ];
  return (
    <section className="doc-details" aria-label="Document details">
      <h2>Document</h2>
      <dl>
        <div>
          <dt>Written by</dt>
          <dd>
            {doc.source === "llm"
              ? "AI, from checked facts"
              : "Deterministic template"}
            {doc.pending && (
              <span className="doc-muted">
                {" "}
                AI draft in progress for this snapshot.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Evidence snapshot</dt>
          <dd>
            <code title={doc.context_sha256}>{doc.snapshot_id}</code>
          </dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>
            {doc.generated_at
              ? `${time(doc.generated_at)}${doc.prompt ? `, ${doc.prompt}` : ""}`
              : "On request from the snapshot"}
          </dd>
        </div>
        <div>
          <dt>Hypotheses</dt>
          <dd>
            {lock?.locked && typeof lock.digest === "string" ? (
              <>
                Locked as v1{" "}
                <code title={lock.digest}>{lock.digest.slice(0, 12)}…</code>
              </>
            ) : (
              "Not locked yet"
            )}
          </dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd>
            <ul className="doc-checks">
              {rows.map(([label, ok, detail]) => (
                <li key={label} className={ok ? "is-ok" : "is-limit"}>
                  <i aria-hidden="true" />
                  <span>{label}</span>
                  <small>{detail}</small>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Updates</dt>
          <dd className={refreshError ? "doc-warn" : undefined}>
            {refreshError
              ? "Refresh interrupted"
              : `Evidence polled every 3 s${updatedAt ? `, last ${time(updatedAt)}` : ""}`}
          </dd>
        </div>
      </dl>
      <p className="doc-hint">
        Select a numbered citation to open the fact behind it, with its source
        in <code>/api/report</code>. Investigation{" "}
        <code>{safeText(report.investigation_id)}</code>.
      </p>
    </section>
  );
}

export function InvestigationDocument({
  report,
  updatedAt,
  refreshError,
  children,
}: {
  report: Report;
  updatedAt: string | null;
  refreshError: boolean;
  children?: ReactNode;
}) {
  const revision = [
    report.narrative?.facts_sha256,
    report.workflow.version,
    report.run.code_commit,
    report.v1?.digest,
    report.current.sessions.length,
  ].join("|");
  const { doc, error } = useReportDocument(revision);
  const sid = useJudgeSession();
  const [active, setActive] = useState<string | null>(null);
  const [section, setSection] = useState("summary");
  const layout = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const facts = useMemo(
    () => new Map((doc?.facts ?? []).map((f) => [f.id, f])),
    [doc],
  );
  const blocks = useMemo(() => (doc ? parseMarkdown(doc.markdown) : []), [doc]);
  const title = blocks.find((b) => b.t === "h" && b.level === 1);
  const body = blocks.filter((b) => b !== title);
  const cites = useMemo(() => citeIndex(blocks, facts), [blocks, facts]);
  const checks = useMemo(() => audit(blocks, facts), [blocks, facts]);
  const toc = body.filter((b) => b.t === "h") as Extract<Block, { t: "h" }>[];

  // The side columns stick just below the site header, whatever its height.
  useEffect(() => {
    const header = document.querySelector(".console-header-surface");
    const update = () =>
      layout.current?.style.setProperty(
        "--doc-top",
        `${Math.round(header?.getBoundingClientRect().height ?? 0) + 16}px`,
      );
    update();
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  // A deep link that arrived before the document did still lands on its heading.
  useEffect(() => {
    if (!doc || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
    // Only when a document first arrives.
  }, [doc?.context_sha256]);
  useEffect(() => {
    if (!doc || typeof IntersectionObserver === "undefined") return;
    const headings = toc
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setSection(visible.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // toc is derived from doc.
  }, [doc]);
  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  });

  function openFact(id: string, from?: HTMLElement) {
    if (from) returnTo.current = from;
    setActive((current) => (current === id && from ? null : id));
  }
  function closeInspector() {
    setActive(null);
    returnTo.current?.focus();
  }

  const mode = MODE[report.run.mode];
  // h3 entries show under their section while it is the one being read.
  let currentSection = "";
  const sectionOf = new Map<string, string>();
  toc.forEach((h) => {
    if (h.level === 2) currentSection = h.id;
    sectionOf.set(h.id, currentSection);
  });
  const openSection = sectionOf.get(section) ?? section;
  const fact = active ? facts.get(active) : undefined;

  return (
    <div className="doc-layout" ref={layout}>
      <nav className="doc-toc" aria-label="Report contents">
        {mode && (
          <p className={`doc-mode is-${report.run.mode}`}>
            <strong>{mode[0]}</strong>
            <span>{mode[1]}</span>
          </p>
        )}
        <p className="doc-toc-title">Contents</p>
        <ol>
          {toc.map((h) =>
            h.level === 2 || sectionOf.get(h.id) === openSection ? (
              <li key={h.id} className={`is-h${h.level}`}>
                <a
                  href={`#${h.id}`}
                  aria-current={section === h.id ? "location" : undefined}
                >
                  {h.text}
                </a>
              </li>
            ) : null,
          )}
        </ol>
      </nav>

      <div className="doc-main">
        {!doc ? (
          <div
            className={error ? "warning" : "doc-loading"}
            role={error ? "alert" : "status"}
          >
            {error ? (
              <>
                <strong>Report document unavailable</strong>
                <span>{safeText(error)}. Retrying every 5 s.</span>
              </>
            ) : (
              "Preparing the investigation document…"
            )}
          </div>
        ) : (
          <article className="doc" aria-labelledby="doc-title">
            <header className="doc-head">
              <div className="doc-file">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5M9 13h6M9 17h6" />
                </svg>
                <span>investigation-report.md</span>
                <span
                  className={`doc-badge${doc.source === "llm" ? " is-ai" : ""}`}
                  title={
                    doc.rejected.length
                      ? doc.rejected.slice(0, 5).join("\n")
                      : undefined
                  }
                >
                  {doc.source === "llm" ? "AI-written" : "Template"} · Facts
                  checked
                </span>
              </div>
              <h1 id="doc-title">
                {safeText(title && title.t === "h" ? title.text : doc.title)}
              </h1>
              <p className="doc-byline">
                GhostReport · Investigation{" "}
                <code>{safeText(doc.investigation_id)}</code> · Evidence
                snapshot{" "}
                <code title={doc.context_sha256}>{doc.snapshot_id}</code>
              </p>
            </header>
            <div className="doc-body">
              <Blocks
                blocks={body}
                cites={cites}
                active={active}
                onCite={openFact}
              />
            </div>
            <details className="doc-raw">
              <summary>
                All {doc.facts.length} facts in this snapshot (JSON)
              </summary>
              <pre>{JSON.stringify(doc.facts, null, 2)}</pre>
            </details>
          </article>
        )}
        {children}
      </div>

      <aside
        className="doc-side"
        aria-label={fact ? "Evidence inspector" : "Document details"}
      >
        {fact ? (
          <Inspector
            fact={fact}
            cite={cites.get(fact.id)}
            facts={facts}
            onSelect={(id) => openFact(id)}
            onClose={closeInspector}
          />
        ) : (
          doc && (
            <>
              <YourSession report={report} sid={sid} />
              <Details
                doc={doc}
                report={report}
                checks={checks}
                updatedAt={updatedAt}
                refreshError={refreshError}
              />
            </>
          )
        )}
      </aside>
    </div>
  );
}
