import { useState } from "react";
import {
  CodeReference,
  EvidenceRefs,
  FindingStatus,
  Panel,
} from "./components";
import { cohortNames, groupKey, safeText, sessions, time } from "./format";
import type { Finding, Hypothesis, Report } from "./types";

function hypothesesFor(report: Report): Hypothesis[] {
  return report.hypotheses.some((h) => h.id === "H_other")
    ? report.hypotheses
    : [
        ...report.hypotheses,
        {
          id: "H_other",
          statement: "A reason not yet proposed",
          class_id: null,
          code_evidence: [],
          generic: true,
        },
      ];
}

function BaselineObservation({
  report,
  hypothesisId,
  cohort,
}: {
  report: Report;
  hypothesisId: string;
  cohort?: string;
}) {
  if (!report.v1)
    return <span className="observation">Baseline awaiting lock</span>;
  const scope = report.v1.sessions.filter(
    (s) => !cohort || s.cohort === cohort,
  );
  const ids = new Set(scope.map((s) => s.session_id));
  const matches = report.v1.decisions.filter(
    (decision) =>
      decision.contradicted_hypotheses.includes(hypothesisId) &&
      decision.session_ids.some((id) => ids.has(id)),
  );
  if (matches.length)
    return (
      <>
        <span className="observation">
          Contradicted by rule{" "}
          {safeText(
            [...new Set(matches.flatMap((d) => d.rule_ids))].join(", "),
          )}
        </span>
        <EvidenceRefs ids={matches.flatMap((d) => d.evidence_ids)} />
      </>
    );
  return (
    <span className="observation">
      {!scope.length
        ? "No observation recorded"
        : scope.some((s) => s.coverage === "unknown")
          ? "Unknown coverage"
          : "No contradiction"}
    </span>
  );
}

function HypothesisMatrix({ report }: { report: Report }) {
  const groups = [
    ...new Map(report.current.findings.map((f) => [groupKey(f), f])).values(),
  ];
  const [chosen, setChosen] = useState("");
  const selected = groups.find((g) => groupKey(g) === chosen) ?? groups[0];
  const current = selected
    ? report.current.findings.filter((f) => groupKey(f) === groupKey(selected))
    : [];
  return (
    <Panel
      id="hypotheses"
      title="Hypothesis Matrix"
      label="Inferred → Self-report"
      description="The same hypotheses, before and after new evidence. Self-report and observation stay separate."
    >
      {groups.length > 0 && (
        <label className="scope-select">
          Evidence population
          <select
            value={selected ? groupKey(selected) : ""}
            onChange={(event) => setChosen(event.target.value)}
          >
            {groups.map((g) => (
              <option key={groupKey(g)} value={groupKey(g)}>
                {g.decision_point} · {cohortNames[g.cohort]} ·{" "}
                {g.question_version}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>Hypothesis</th>
              <th>
                <span className="column-title">v1 · locked baseline</span>
                <span className="muted small">
                  {report.v1 ? time(report.v1.data_cutoff) : "Awaiting lock"}
                </span>
              </th>
              <th>
                <span className="column-title">Current · v2 candidate</span>
                <span className="muted small">
                  {time(report.current.data_cutoff)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {hypothesesFor(report).map((hypothesis) => {
              const finding = current.find(
                (f) => f.hypothesis_id === hypothesis.id,
              );
              return (
                <tr key={hypothesis.id}>
                  <th scope="row">
                    <div className="hypothesis-id">
                      {safeText(hypothesis.id)}
                      {hypothesis.generic && (
                        <span className="generic">generic</span>
                      )}
                    </div>
                    <p>{safeText(hypothesis.statement)}</p>
                    <div className="fact-links">
                      {hypothesis.code_evidence.map((id) => (
                        <a key={id} href={`#fact-${id}`}>
                          {safeText(id)}
                        </a>
                      ))}
                    </div>
                  </th>
                  <td>
                    <div className="finding-status">
                      <span className="status neutral">Unresolved</span>
                      <strong className="count-text">0 of 0 respondents</strong>
                      <BaselineObservation
                        report={report}
                        hypothesisId={hypothesis.id}
                        cohort={selected?.cohort}
                      />
                    </div>
                  </td>
                  <td>
                    {finding ? (
                      <FindingStatus finding={finding} />
                    ) : (
                      <div className="finding-status">
                        <span className="status neutral">Unresolved</span>
                        <span className="muted">No scoped response record</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Funnel({ report }: { report: Report }) {
  const total = report.current.sessions.length;
  const steps = [
    ["Visitors", report.current.funnel.visitors],
    ["Apply clicked", report.current.funnel.apply_clicked],
    ["Attempted", report.current.funnel.attempted],
    ["Connected", report.current.funnel.connected],
  ] as const;
  return (
    <Panel
      id="funnel"
      title="Funnel"
      label="Observed"
      description="Recorded behavior in the current run. Each step uses all recorded sessions as its denominator."
    >
      <div className="funnel">
        {steps.map(([label, count]) => (
          <div className="funnel-step" key={label}>
            <span>{label}</span>
            <strong>{sessions(count, total)}</strong>
            <div className="funnel-track" aria-hidden="true">
              <div
                style={{
                  width: `${total ? Math.min(100, (count / total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="panel-note">
        Baseline funnel details are not included in the report contract. The
        baseline session snapshot remains available in the hypothesis
        comparison.
      </p>
    </Panel>
  );
}

function Workflow({ report }: { report: Report }) {
  const groups = [
    ["States", report.workflow.states],
    ["Outcomes", report.workflow.outcomes],
    ["UI facts", report.workflow.ui_facts],
  ] as const;
  return (
    <Panel
      id="workflow"
      title="Workflow Map"
      label="Code evidence"
      description={`Source map ${report.workflow.version} · commit ${report.workflow.scope.commit_sha}`}
    >
      {groups.map(([title, facts]) => (
        <div className="workflow-group" key={title}>
          <h3>{title}</h3>
          {facts.length ? (
            facts.map((fact) => (
              <article
                className="code-fact"
                id={`fact-${fact.id}`}
                key={fact.id}
              >
                <span className="fact-id">{safeText(fact.id)}</span>
                <p>{safeText(fact.desc)}</p>
                <CodeReference fact={fact} />
              </article>
            ))
          ) : (
            <p className="muted">No source facts returned for this category.</p>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Gaps({ report }: { report: Report }) {
  const gaps = report.workflow.outcomes.filter(
    (o) => o.instrumentation !== "found_in_code",
  );
  return (
    <Panel
      id="gaps"
      title="Evidence Gaps"
      label="Code evidence"
      description="Absence claims apply only to the searched files."
    >
      {gaps.length ? (
        gaps.map((fact) => (
          <article className="gap" key={fact.id}>
            <div className="gap-heading">
              <h3>{safeText(fact.id)}</h3>
              <span
                className={
                  fact.instrumentation === "unknown"
                    ? "status neutral"
                    : "status missing"
                }
              >
                {fact.instrumentation === "unknown"
                  ? "Unknown within searched scope"
                  : "not found in searched files"}
              </span>
            </div>
            <p>{safeText(fact.desc)}</p>
            <CodeReference fact={fact} />
          </article>
        ))
      ) : (
        <p className="muted">
          No unresolved outcome instrumentation returned within this search
          scope.
        </p>
      )}
      <div className="search-scope">
        <h3>Searched files</h3>
        <ul>
          {report.workflow.scope.searched_files.map((file) => (
            <li key={file}>
              <code>{safeText(file)}</code>
            </li>
          ))}
        </ul>
        <p>
          {report.workflow.scope.truncated
            ? "Search pack truncated; instrumentation status remains uncertain."
            : "Search pack not truncated. This does not represent the entire repository."}
        </p>
        {report.workflow.scope.unresolved_imports.length > 0 && (
          <p>
            Unresolved imports:{" "}
            <code>
              {safeText(report.workflow.scope.unresolved_imports.join(", "))}
            </code>
          </p>
        )}
      </div>
    </Panel>
  );
}

function Trace({ report }: { report: Report }) {
  return (
    <Panel
      id="trace"
      title="Decision Trace"
      label="Policy"
      description="Deterministic actions, in the order returned by the engine."
    >
      {report.current.decisions.length ? (
        <ol className="decision-list">
          {report.current.decisions.map((decision, index) => (
            <li key={`${decision.action_id}:${decision.data_version}:${index}`}>
              <div className="decision-main">
                <div className="decision-top">
                  <code>{safeText(decision.action_id)}</code>
                  <span className="status neutral">
                    {safeText(decision.result ?? "No result")}
                  </span>
                </div>
                <p>{safeText(decision.reason)}</p>
                <div className="decision-meta">
                  <span>
                    {sessions(
                      decision.session_ids.length,
                      report.current.sessions.length,
                    )}
                  </span>
                  <span>
                    Rules:{" "}
                    <code>
                      {safeText(decision.rule_ids.join(", ") || "None applied")}
                    </code>
                  </span>
                  <span>
                    Data version: <code>{safeText(decision.data_version)}</code>
                  </span>
                </div>
                <EvidenceRefs ids={decision.evidence_ids} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          No policy decisions recorded in the current data version.
        </p>
      )}
    </Panel>
  );
}

function Coverage({ report }: { report: Report }) {
  const countLabels = [
    ["shown", "Shown"],
    ["answered", "Answered"],
    ["skipped", "Skipped"],
    ["shown_no_response", "Shown, no response"],
    ["pending", "Pending event arrival"],
    ["unknown_coverage", "Unknown coverage"],
    ["inferred_from_response", "Inferred from response"],
  ] as const;
  return (
    <Panel
      id="coverage"
      title="Coverage"
      label="Observed"
      description="Delivery, response and telemetry coverage are reported separately."
    >
      <div className="probe-coverage">
        {report.current.probes.map((probe) => (
          <article key={probe.plan_id}>
            <h3>
              {probe.decision_point} ·{" "}
              {probe.target_cohorts.map((c) => cohortNames[c]).join(", ")}
            </h3>
            <p className="muted">{safeText(probe.stem)}</p>
            <dl className="coverage-counts">
              {countLabels.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{sessions(probe.counts[key], probe.counts.shown)}</dd>
                </div>
              ))}
            </dl>
            <p className="small muted">
              Reference population: sessions with a recorded exposure for this
              plan. Shown uses that same population. Eligibility reach is not
              supplied.
            </p>
            <p className="small muted">
              Question <code>{safeText(probe.question_version)}</code> ·
              Collection ends {time(probe.ends_at)}
            </p>
          </article>
        ))}
      </div>
      <div className="table-scroll">
        <table className="cohort-table">
          <caption>Recorded session coverage and exits</caption>
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Recorded population</th>
              <th>Complete</th>
              <th>Unknown</th>
              <th>Exit types</th>
            </tr>
          </thead>
          <tbody>
            {report.current.cohorts.map((cohort) => (
              <tr key={cohort.cohort}>
                <th scope="row">{cohortNames[cohort.cohort]}</th>
                <td>
                  {sessions(cohort.sessions, report.current.sessions.length)}
                </td>
                <td>{sessions(cohort.coverage_complete, cohort.sessions)}</td>
                <td>{sessions(cohort.coverage_unknown, cohort.sessions)}</td>
                <td>
                  {Object.entries(cohort.exit_types).map(([exit, count]) => (
                    <div key={exit}>
                      {exit.replaceAll("_", " ")} ·{" "}
                      {sessions(count, cohort.sessions)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.current.orphan_responses > 0 && (
        <p className="warning">
          Unlinked response records need review before interpretation.
        </p>
      )}
    </Panel>
  );
}

function Findings({ report }: { report: Report }) {
  const groups = new Map<string, Finding[]>();
  for (const finding of report.current.findings) {
    const key = groupKey(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return (
    <Panel
      id="findings"
      title="Findings"
      label="Self-report / Unresolved"
      description="Selections describe respondents in each question population. Multiple reasons can coexist."
    >
      {[...groups.entries()].map(([key, findings]) => (
        <article className="finding-group" key={key}>
          <header>
            <h3>
              {findings[0].decision_point} · {cohortNames[findings[0].cohort]}
            </h3>
            <span className="muted small">
              Question {safeText(findings[0].question_version)}
            </span>
          </header>
          {findings.map((finding) => (
            <div className="finding-row" key={finding.hypothesis_id}>
              <div>
                <span className="hypothesis-id">
                  {safeText(finding.hypothesis_id)}
                </span>
                <p>
                  {safeText(
                    hypothesesFor(report).find(
                      (h) => h.id === finding.hypothesis_id,
                    )?.statement ?? "Hypothesis description unavailable",
                  )}
                </p>
              </div>
              <FindingStatus finding={finding} />
            </div>
          ))}
        </article>
      ))}
      {!groups.size && (
        <p className="muted">
          Unresolved · No scoped response evidence returned yet.
        </p>
      )}
    </Panel>
  );
}

function NextAction({ report }: { report: Report }) {
  const gaps = report.workflow.outcomes.filter(
    (o) => o.instrumentation !== "found_in_code",
  );
  return (
    <Panel
      id="next-action"
      title="Next Action"
      label="Recommendation"
      description="Suggestions for a developer to review. No code changes are executed."
    >
      <ul className="next-actions">
        {gaps.map((gap) => (
          <li key={gap.id}>
            <h3>
              {gap.instrumentation === "unknown"
                ? `Resolve the search scope for ${safeText(gap.id)}`
                : gap.id === "wallet_rejected"
                  ? "Instrument onReject"
                  : gap.id === "wallet_errored"
                    ? "Instrument the RPC error path"
                    : `Review instrumentation for ${safeText(gap.id)}`}
            </h3>
            <p>
              {gap.instrumentation === "unknown"
                ? "Inspect unresolved source paths before making an instrumentation recommendation."
                : "Record this outcome with its attempt ID, then review the diagnostic question with new evidence."}
            </p>
            <a href={`#fact-${gap.id}`}>View source evidence</a>
          </li>
        ))}
        {report.workflow.ui_facts.some(
          (f) => f.id === "no_requirement_copy",
        ) && (
          <li>
            <h3>Review requirement copy before Apply</h3>
            <p>
              Evaluate a clearer introduction to the application requirements in
              a separate product experiment.
            </p>
            <a href="#fact-no_requirement_copy">View source evidence</a>
          </li>
        )}
        {!gaps.length && (
          <li>
            Review unresolved hypotheses before choosing the next evidence
            collection step.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function Limitations() {
  return (
    <Panel
      id="limitations"
      title="Limitations"
      label="Observed · Scope"
      description="Read these alongside every finding."
    >
      <ul className="limitations-list">
        <li>
          <strong>Coverage</strong>
          <p>
            Only consenting, active sessions at eligible exits could receive a
            question. Missing exposure beacons may leave unseen gaps.
            Eligible-population counts are not supplied by this API.
          </p>
        </li>
        <li>
          <strong>Nonresponse</strong>
          <p>
            Skipped questions and shown questions without responses remain
            separate from answers. People who answer may differ from people who
            do not.
          </p>
        </li>
        <li>
          <strong>Generalization</strong>
          <p>
            Self-reports describe respondents in the displayed decision point,
            question version and cohort at exposure. They do not represent
            everyone who visited or left.
          </p>
        </li>
        <li>
          <strong>Inactive sessions</strong>
          <p>
            Inactive and open sessions are not asked. An inactivity threshold
            does not establish that someone closed the tab.
          </p>
        </li>
        <li>
          <strong>Mock wallet</strong>
          <p>
            An in-page mock wallet differs from a real extension, including how
            people identify who is asking for access.
          </p>
        </li>
        <li>
          <strong>Evidence limits</strong>
          <p>
            Recorded exposure is not proof that someone read the content.
            Missing events do not establish that an interaction never happened.
            Multiple selections can overlap.
          </p>
        </li>
      </ul>
    </Panel>
  );
}

export function ReportPanels({ report }: { report: Report }) {
  return (
    <>
      <Funnel report={report} />
      <HypothesisMatrix report={report} />
      <div className="panel-pair">
        <Workflow report={report} />
        <Gaps report={report} />
      </div>
      <Trace report={report} />
      <Coverage report={report} />
      <Findings report={report} />
      <div className="panel-pair final-pair">
        <NextAction report={report} />
        <Limitations />
      </div>
    </>
  );
}
