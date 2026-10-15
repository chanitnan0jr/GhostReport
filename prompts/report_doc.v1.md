## Task

Write the investigation report as one Markdown document from `context.facts`. A reader should understand what was investigated, what was recorded, what participants reported and what remains unknown, in that order, in plain and calm English.

A checker verifies every sentence. If anything fails, your document is discarded and a template is shown instead, so follow these rules exactly.

### Structure

1. Start with one title line `# <context.title>`.
2. Then use exactly these `##` sections, in this order and spelled exactly as in `outline`: `## Executive Summary`, `## 1. Investigation Scope`, `## 2. Observed User Behavior`, `## 3. Hypothesis Findings`, `## 4. Evidence Gaps`, `## 5. Recommended Actions`, `## 6. Limitations`, `## Appendix`.
3. Use `###` for subsections (in section 3, one `### H<n>` per hypothesis). Do not use `####` or deeper headings.
4. Allowed Markdown: paragraphs, `-` lists, `1.` lists, tables with a header row, `**bold**`, `*italic*`, `` `code` ``, and callouts that start with `> [!NOTE]` or `> [!WARNING]` followed by lines starting with `> `. No HTML, links, images, code fences or indented code.

### Citations

5. Cite facts as `[fact:<id>]`, using only IDs from `context.facts`. Put the citation at the end of the sentence, list item or table row it supports.
6. Every sentence or table row that contains a number must cite the fact or facts that contain that number. A number is allowed only if it is one of the cited facts' `numbers`.
7. Write counts as "k of n sessions" or "k of n respondents", always with the unit. The pair (k, n, unit) must be one of the cited facts' `pairs`. A respondents split may also be written as "seed 3 of 6" or "visitors 1 of 2". Never write a bare "k of n", a spelled-out quantity (two, three, half), or a vague one (most, many, few, several).
8. Do not count anything yourself (decision points, outcomes, hypotheses, files). Write a count only when a cited fact has it, for example the outcome counts in `[fact:instrumentation]`.
9. Facts have an `evidence` kind. Never cite a `self_report` fact (what respondents answered) in the same sentence as an `observed` or `code` fact (what the application recorded or what the code contains). Keep answers and recordings in separate sentences.

### Wording

10. Report answers as what respondents selected, never as what happened or why. Respondents are "respondents", not users or visitors.
11. Never use these words or their forms: cause, because, due to, led to, result in, prove, refute, confirm, root, likely, probable, significant, suggest, indicate, imply, explain, drive, attribute, demonstrate, therefore, thus, hence, consequently, "so that", "which means", "shows that", percent.
12. An outcome whose `data.instrumentation` is `unknown` is not a gap: say its search scope is unresolved and that it is "not established as a gap". Outcomes with `not_found_in_scope` are candidates for review.
13. R2 applies only to complete-coverage sessions that meet it. Never say it refutes a cohort or settles why sessions stopped.
14. Do not infer intent from events that were not recorded. In unknown-coverage sessions, an event that was not recorded is not evidence that the step did not happen.

### Voice

Write like a careful technical investigation report: short paragraphs, plain sentences, no marketing tone. Prefer a table for counts across cohorts. Keep each list item to one claim and end it with its citation. Do not restate every code fact; cite the ones the reader needs.

### Content

15. Executive Summary: what was investigated, what was observed, what participants reported, and what remains unknown. Cite `[fact:population]` here.
16. Section 3 must cite every `finding` fact and give each finding its own evidence status from its `data.status`; one hypothesis can have different statuses at different decision points. Mention R2 for a hypothesis only when its `data.r2_applies` is true.
17. Section 4 must cite every `outcome` fact whose instrumentation is `unknown`.
18. Section 6 must cite every `limit` fact whose `data.ok` is false, and should cover simulated sessions, non-response, unverified build and unknown coverage when the facts show them.
19. Section 5 recommends next steps only from what sections 2 to 4 found. Recommend resolving unknown search scopes before adding tracking.
20. Appendix: the v1 digest in `code` with `[fact:lock_v1]`, and the source references of the outcome facts as `` `file:line` ``.

The input is `{"outline": [...], "context": {...}}`. If it also has `checker_problems`, your `previous_markdown` was rejected for those reasons: write a new document that fixes every one of them.

Return `{"markdown": "..."}`.
