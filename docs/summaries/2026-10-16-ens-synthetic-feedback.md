# ENS synthetic load and feedback

**Branch:** main
**Status:** Implemented and checked on localhost; not pushed
**Risk:** Medium; isolated synthetic data and owner-authenticated load

## Goal and scope

The owner requested simulated feedback as well as simulated logs for exercising
an ENS report. This implements that report-testing mode. It does not execute an
ENS app, provide real ENS analytics integration, or add an ENS Playwright runner.

- Add an isolated SQLite-backed simulation service, registered outside nested
  DAO sandboxes. An approved ENS journey spec is required before creation.
- Freeze the journey spec, event vocabulary, authored paths and question before
  load. Generate event IDs/sequences/server timestamps, exposures and feedback.
- Exercise answered, skipped, unanswered, not-shown and mixed modes. Exclude
  completed and inactive sessions from questions. Shuffle options with Other
  last. Feedback sampling is independent of journey classification.
- Compute segment counts and respondent denominators server-side. Skips do not
  change findings; small groups remain Unresolved. Instrumentation is unverified;
  this data cannot establish instrumentation absence or real visitor behaviour.
- Keep owner tokens hashed on the server and out of public reports. Enforce
  per-run ownership, batch idempotency and limits. Store generated records outside
  DAO Mock evidence and keep its locked v1 unchanged.
- Add report controls, baseline comparison, findings, coverage, logs, limitations
  and a backend-computed static preview. Shared simulation URLs are read-only.
- Remove simulation context when switching to Mock data.

Planned and actual scope: `engine/ens_simulation.py`, its route registration in
`engine/api.py`, `tests/test_ens_simulation.py`, the console simulation component,
styles, API types, mock sample, unit/browser checks, shared navigation and docs.
Unrelated untracked files and the owner handoff were preserved.

## Verification

- Backend: 114 tests passed; strict mypy passed for 31 modules. Changed Python
  files pass Ruff. Full Ruff retains the same nine pre-existing E501 warnings in
  policy, reconcile and storage.
- Frontend: console 44, app 39 and landing 15 tests passed; type checks passed.
  Formatting passed. Five projector browser checks passed, including the static
  ENS synthetic feedback preview and leaving its project context correctly.
- Docker built all three frontends; gate instrumentation verification passed.
- Actual localhost browser created a separate synthetic run, added 20 generated
  sessions with answers, then 10 with skips. The result held 30 synthetic
  sessions, 16 simulated answers and nine skips. The added skips left findings
  and respondent counts unchanged. The simulation baseline digest stayed fixed.
- Shared-browser view has no load control; a load request without its owner
  token returned 401. Public generated records contained the synthetic flags.
- DAO Mock funnel, source counts and locked v1 digest remained unchanged.
- No page errors or horizontal page overflow at 1440px. Screenshot:
  `/tmp/ghostreport-ens-synthetic-report.png`.

An initial real-browser check exposed select labels that included all option
text. Exact accessible names were added and the complete browser flow passed.
A test-query option initially failed TypeScript and a Docker build; it was
corrected, the local commit amended, and the subsequent build/tests passed.
The failed build did not replace the running service. Two empty synthetic runs
from those initial checks remain in the separate simulation database.

No dependencies were changed; dependency scan not run. No production deployment,
push, or LLM call is introduced by this mode.

## Assumptions and remaining limits

- The generic feedback options are authored simulation presets, not the ENS
  investigation's hypotheses. The UI and report label this explicitly.
- ENS source analysis remains code-only. Browser-driven validation still needs
  its own ENS runner and analytics adapter.
- Limits are local: 200 sessions per batch, 1000 per run and 100 runs per database.
  Browser owner tokens persist in localStorage; another browser sees a read-only
  report. Losing that local token requires starting a new isolated run.
- The DAO-specific report contract and R2 policy are not repurposed for ENS.
  The simulation has a separate report contract documented in
  `docs/ENS-Simulation.md`.

## Version control, workflow and recovery

Separate local module commits:

- `f41e754` — engine synthetic load/feedback service and integration checks.
- `040a9df` — shared project-context guard.
- `30930b9` — console synthetic report and static preview.
- `d14fe6b` — accessible form controls found by real-browser inspection.

This summary is committed separately. Applied `agentic-workflow` scope,
verification, explicit staging, Conventional Commits, saved report and no-push
rules. Production deployment procedures were skipped: this work targets the
existing localhost stack. All required relevant handoff checks ran.

Recovery: revert these feature commits and rebuild the local image. The separate
simulation database can remain unused; no core data migration or volume removal
is required. Maintainer owns recovery; rollback was not rehearsed.

## Next step

Open `http://localhost/report/?project=ens`, select **Start ENS simulation**, then
**Add simulated load + feedback**. Each creator gets their own run, without
mixing generated answers into real visitor findings.
