# Task: Stage B — Competing hypotheses and the evidence that would separate them

The Input contains: the investigation question, the validated Workflow Map from Stage A (its IDs are the only code evidence you may cite), cohort statistics observed so far, and the team's catalogs of hypothesis classes, actions and rules.

## Hypotheses
- Propose 3–5 competing hypotheses that answer the investigation question for this cohort, with IDs `H1`, `H2`, ... Several reasons can be true at once; they do not need to be mutually exclusive.
- The cohort is defined by having no recorded connect attempt. Do not propose reasons that require an attempt (such as a failed or rejected connection).
- At least one must be a non-problem explanation (for example, the person was only browsing).
- `statement`: one sentence from the user's point of view, concrete to this workflow, giving exactly one reason. If two reasons come to mind, make them two hypotheses.
- `code_evidence`: IDs from the Workflow Map that make this hypothesis plausible for this code. Use only IDs that appear in the Workflow Map. If none apply, use `[]` and set `generic: true`; otherwise `generic: false`.
- `class_id`: the catalog class whose definition matches the statement exactly, or `null`. Do not stretch a definition: a general distrust of wallets is not the same class as concern about the permissions displayed in this gate.
- Always include `H_other` with statement "A reason not yet proposed", `class_id: null`, `code_evidence: []`, `generic: true`.

## Proposed actions
Choose only from the action catalog, with its exact parameters. For each action, `note` must say which result would contradict which hypothesis and why. Cite only `rule_ids` that exist in the rule catalog. You may also propose `recommend_instrument` for an outcome whose instrumentation is `not_found_in_scope` or `unknown`, and say which hypotheses it would help separate.

## Probe options
For each decision point, write up to 3 answer options in plain, neutral user language (no jargon, no leading wording). Each option states exactly one reason and maps to the one hypothesis it supports (two at most, only if they are inseparable in plain language).
- `DP1` — shown after the user clicks "Not now" in the wallet gate. Fixed question: "What best describes your decision not to connect right now?"
- `DP2` — shown after the user goes back from the project page, possibly without having seen the gate. Fixed question: "What were you hoping to do on this page?" Do not mention wallets in DP2 options.
Do not write "Something else", "Skip", or any option about not knowing who is asking (at DP1); the system adds these. Every option must map to at least one hypothesis other than H_other.
