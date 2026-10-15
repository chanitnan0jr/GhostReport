# Task: Stage A — Workflow Map

Read the repository content above and map the user workflow named in the Input.

Produce three lists:

1. `states` — the steps a user moves through in this workflow (pages, modals, gates, popups) and the conditions that move them between steps. Include any gate that blocks progress (for example, a wallet that must be connected before an action).
2. `outcomes` — the distinct results a user's attempt can end in (for example: connected, rejected by the user, failed with an error, dismissed). For each outcome, cite the handler code that runs when it happens and set `instrumentation`:
   - `found_in_code`: an analytics call that records this outcome runs inside the cited handler range.
   - `not_found_in_scope`: you read the handler and no analytics call for this outcome runs there.
   - `unknown`: the handler delegates to code you were not given, or the call is conditional on something you cannot resolve.
   If an analytics call exists but is disabled or unreachable (for example, inside a branch on a constant that is false), it does not run: say so in `desc` and do not mark it `found_in_code`.
3. `ui_facts` — what the user can or cannot see that is relevant to deciding whether to continue: copy that explains (or fails to explain) a requirement, permission text, error messages, buttons that let them leave. A missing explanation is a valid fact if you cite the place where it would be expected (for example, the button that starts the flow).

Every item needs:
- `id`: short snake_case, unique across all three lists.
- `desc`: one plain sentence describing what the code does.
- `code_ref`: `file` (exactly as in the FILE header), `lines` `[start, end]` (inclusive, from the line numbers shown), and `quote` (copied exactly from those lines, at most ~120 characters).

Aim for 3–8 states, all distinct outcomes you can find, and 2–6 UI facts. Describe behavior only; do not guess why users behave as they do — that is a later stage.
