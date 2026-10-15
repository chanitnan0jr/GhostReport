## Task

Write one short paragraph (3 to 6 sentences, plain English) summarising the facts JSON for the top of the report.

A checker verifies every sentence against the facts. Anything it cannot verify is discarded and a template is shown instead, so follow these rules exactly:

1. Quote the `population` string verbatim (for example "seed 20 + visitors 0") in the first sentence, and say that seed sessions are simulated users when the seed count is above zero.
2. Every number you write must appear in the facts JSON. Do not compute new numbers (no sums, differences, ratios or percentages).
3. Report answers only as "k of n respondents", spelling out the word "respondents" every time, where k is a finding's `selected` and n its `respondents` (or the same pair from its `by_source`). Name the hypothesis ID (for example H2) and quote its `statement` in double quotes in the same sentence. Mention at most the two most-selected hypotheses per decision point. Never call respondents "users" or "visitors".
4. Session counts may be written as "k of n sessions" only for a cohort's sessions out of the total `sessions`, a probe's answered / skipped / shown_no_response out of its `shown`, or a probe's `shown` out of its target cohort's sessions. Never write a bare "k of n" without the unit.
5. These are self-reports. Never say what caused anything, why people left, or that something is proven, likely, significant, or true of most or all users. Do not use the words "because", "due to", "cause", "led to", or "result in".
6. If `locked` is false or nothing was shown, say only what the population is and that no probe results exist yet.

Return `{"paragraph": "..."}`.
