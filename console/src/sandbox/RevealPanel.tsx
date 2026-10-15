import type { Reveal } from "./types";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** What the generator set (hidden from the engine) beside what the report counted. */
export function RevealPanel({ reveal }: { reveal: Reveal }) {
  if (!reveal.available)
    return (
      <p className="sbx-hint">
        Generate traffic after the lock first. The reveal compares those answers
        with what the report counted.
      </p>
    );
  return (
    <div className="sbx-reveal">
      {reveal.questions.map((question) => {
        const lost =
          question.counted.not_counted_unknown_coverage +
          question.counted.not_counted_pending;
        return (
          <section
            className="sbx-reveal-question"
            key={question.decision_point}
            aria-labelledby={`reveal-${question.decision_point}`}
          >
            <h3 id={`reveal-${question.decision_point}`}>
              <span>{question.decision_point}</span> {question.stem}
            </h3>
            <p className="sbx-hint">
              Shown {question.generated.shown} times ·{" "}
              {question.generated.answered} simulated answers ·{" "}
              {question.counted.respondents} counted as respondents
              {lost > 0 &&
                ` · ${question.counted.not_counted_unknown_coverage} not counted (lost events), ${question.counted.not_counted_pending} still waiting for late events`}
            </p>
            <div className="sbx-table-wrap">
              <table className="sbx-table">
                <caption className="sbx-visually-hidden">
                  {question.decision_point}: answer mix set in the sandbox
                  beside the answers the report counted
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Option</th>
                    <th scope="col">You set</th>
                    <th scope="col">Simulated answers</th>
                    <th scope="col">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {question.options.map((option) => (
                    <tr key={option.id}>
                      <th scope="row">{option.label}</th>
                      <td>{percent(option.set_share)}</td>
                      <td>{option.generated_answers}</td>
                      <td>{option.counted_answers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sbx-table-wrap">
              <table className="sbx-table">
                <caption className="sbx-visually-hidden">
                  {question.decision_point}: each hypothesis, the share the mix
                  implies, and the report’s k of n
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Hypothesis</th>
                    <th scope="col">Mix implies</th>
                    <th scope="col">Report</th>
                    <th scope="col">Rule check</th>
                  </tr>
                </thead>
                <tbody>
                  {question.hypotheses.map((row) => (
                    <tr key={row.hypothesis_id}>
                      <th scope="row">
                        <span className="sbx-id">{row.hypothesis_id}</span>{" "}
                        {row.statement}
                      </th>
                      <td>{percent(row.expected_share)}</td>
                      <td>
                        {row.selected} of {row.respondents} respondents
                        <span className="sbx-label">{row.self_report}</span>
                      </td>
                      <td>{row.observation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <ul className="sbx-notes">
        <li>
          Counts move around the mix you set: each simulated person picks at
          random, and small numbers swing the most. Below 3 respondents the
          report says Unresolved.
        </li>
        <li>
          Answers from sessions with lost events are not counted. The report
          cannot tell which segment those sessions were in.
        </li>
        <li>
          One option can map to two hypotheses, so the shares in the second
          table can add up to more than 100%.
        </li>
        <li>
          Rule R2 is checked from recorded events, separately from answers. In
          sessions with complete events and no gate event, a hypothesis about
          the gate’s permissions is marked “Contradicted by rule R2”.
        </li>
      </ul>
    </div>
  );
}
