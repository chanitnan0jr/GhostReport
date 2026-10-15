## Task

Write the investigation report as one Markdown document from `context.facts`. A reader should understand what was investigated, what was recorded, what participants reported and what remains unknown, in that order, in plain and calm English.

A checker verifies every sentence. If anything fails, your document is discarded and a template is shown instead, so follow these rules exactly.

### Structure

1. Start with one title line `# <context.title>`.
2. Then use exactly these `##` sections, in this order and spelled exactly as in `outline`: `## Executive Summary`, `## 1. Investigation Scope`, `## 2. Observed User Behavior`, `## 3. Hypothesis Findings`, `## 4. Evidence Gaps`, `## 5. Recommended Actions`, `## 6. Limitations`, `## Appendix`.
3. Use `###` for subsections (in section 3, one `### H<n>` per hypothesis). Do not use `####` or deeper headings.
4. Allowed Markdown: paragraphs, `-` lists, `1.` lists, tables with a header row, `**bold**`, `*italic*`, `` `code` ``, and callouts that start with `> [!NOTE]` or `> [!WARNING]` followed by lines starting with `> `. No HTML, links, images, code fences or indented code.

### Numbers and citations

5. Never type a count or any other number yourself. Each fact has a `handle` (f1, f2, …) and a `placeholders` map: write the placeholder and the renderer inserts the text shown for it, with the fact's citation. For example `{f12}` becomes "8 of 23 sessions [fact:cohort_gate_event_no_attempt]", and `{f12.sessions}` becomes "8". Use only placeholders listed in a fact's `placeholders`.
6. Counts read as "k of n sessions" or "k of n respondents"; `{fN}` and `{fN.2}` already include the unit. Do not add a unit after them. Never write a spelled-out quantity (two, three, half) or a vague one (most, many, few, several), and do not count things yourself (decision points, outcomes, hypotheses, files).
7. To cite a fact without a number, write `[fact:<id>]` at the end of the sentence, list item or table row it supports, using only IDs from `context.facts`.
8. Facts have an `evidence` kind. Never use a `self_report` fact (what respondents answered) in the same sentence as an `observed` or `code` fact (what the application recorded or what the code contains). Keep answers and recordings in separate sentences.
9. Whenever you name a hypothesis (H1, H2, …), give its statement too, with its `{fN.statement}` placeholder from the hypothesis fact, for example "H2 {f14.statement} was selected by {f21}." Never show a hypothesis ID alone.

### Wording

10. Report answers as what respondents selected, never as what happened or why. Respondents are "respondents", not users or visitors.
11. Never use these words or their forms: cause, because, due to, led to, result in, prove, refute, confirm, root, likely, probable, significant, suggest, indicate, imply, explain, drive, attribute, demonstrate, therefore, thus, hence, consequently, "so that", "which means", "shows that", percent.
12. An outcome whose `data.instrumentation` is `unknown` is not a gap: say its search scope is unresolved and that it is "not established as a gap". Outcomes with `not_found_in_scope` are candidates for review.
13. R2 applies only to complete-coverage sessions that meet it. Never say it refutes a cohort or settles why sessions stopped.
14. Do not infer intent from events that were not recorded. In unknown-coverage sessions, an event that was not recorded is not evidence that the step did not happen.

### Voice

Write like a careful technical investigation report: short paragraphs, plain sentences, no marketing tone. Prefer a table for counts across cohorts. Keep each list item to one claim and end it with its citation. Do not restate every code fact; cite the ones the reader needs.

### Content

15. Executive Summary: what was investigated, what was observed, what participants reported, and what remains unknown. Cite the population here (its `{fN}` or `[fact:population]`).
16. Section 3 must use every `finding` fact and give each finding its own evidence status from its `data.status`; one hypothesis can have different statuses at different decision points. Mention R2 for a hypothesis only when its `data.r2_applies` is true.
17. Section 4 must cite every `outcome` fact (with `[fact:<id>]`) whose instrumentation is `unknown`.
18. Section 6 must cite every `limit` fact (`{fN}` gives its value) whose `data.ok` is false, and should cover simulated sessions, non-response, unverified build and unknown coverage when the facts show them.
19. Section 5 recommends next steps only from what sections 2 to 4 found. Recommend resolving unknown search scopes before adding tracking.
20. Appendix: the v1 digest in `code` (its `{fN.digest}` placeholder) with `[fact:lock_v1]`, and the source references of the outcome facts as `` `file:line` ``.

The input is `{"outline": [...], "context": {...}}`. If it also has `checker_problems`, your `previous_markdown` was rejected for those reasons: write a new document that fixes every one of them.

Return `{"markdown": "..."}`.
