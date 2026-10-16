# Sandbox flow audit and fixes

**Date:** 2026-10-16

**Branch:** main

**Implementation commits:** 7cac9d9 (engine), 72f2db8 (console)

**Status:** Verified locally; awaiting human push/deployment

**Risk:** Medium; draft approval and request recovery, no schema migration

**Scope:** User requested further Sandbox inspection after the journey-contract fix.

## Findings and changes

| Finding | Fix | Evidence |
| --- | --- | --- |
| A failed replacement investigation left an older draft available, labelled with the newer snapshot metadata | Remove the previous draft when a replacement starts; display and accept AI drafts only after a successful investigation | Regression reproduced `draft_ready` after failure; now no draft and AI lock returns 409 |
| Investigation workers did not close their LLM SQLite cache connection | Close the connection in the worker on all exit paths | Tracked SQLite connections prove cleanup on success and failure |
| Initial API failures left the panel at “Opening the sandbox…”; polling failures were silent | Display the failure with retry on initial load; retain the last loaded state with a warning on polling failure; clear on recovery | UI regressions cover 503, manual retry, and periodic recovery |
| Passing a caller AbortSignal bypassed the API request deadline | Combine caller cancellation and the twenty-second deadline | Tests independently abort from each signal |
| Reloading during journey generation selected Investigate and showed misleading progress | Select Generate journeys when the journey task is running | UI regression checks the active step and absence of investigation progress |

Old failed runs that still have a draft file are protected by both the state
view and the AI lock endpoint. The prepared investigation remains available as
a recovery path. Existing locked v1 snapshots and original cohort rules remain
unchanged. No authentication mechanism or owner-token format changed.

## Flow checked

An API integration test drives creation, pre-lock traffic, journey generation,
review/approval, investigation, AI lock, post-lock traffic, and Reveal. It then
opens the persisted run in a new app instance and checks:

- The locked digest and approved journey digest remain unchanged.
- Reveal and report counts survive restart.
- Generated sessions remain seed, never visitors.
- The judging run remains empty and separate.
- Consumed AI runs persist, and the original owner can still append traffic.

Existing tests also cover owner/other-browser rejection, pending work blocking
reset/traffic, quotas and resets, expiry, dropped-event coverage, prepared-lock
flow, answer mix, and AI cache reuse. A no-call failure regression verifies that
the shared reservation is refunded and the sandbox AI counter stays unchanged.

## Verification

| Check | Result |
| --- | --- |
| Backend regression suite | 127 passed |
| Console unit/component suite | 49 passed |
| Landing Sandbox entry tests | 2 passed |
| Console production build | Passed (TypeScript and Vite) |
| Ruff, changed Python files | Passed |
| Strict mypy, `engine/sandbox.py` | Passed |
| Type checking the test module | Existing `no-any-return` in `wait_for_investigation` remains; imported `test_api.py` also has existing strict typing errors |
| Diff whitespace check | Passed |
| Live DeepSeek, browser integration, Railway deployment | Not run |
| Dependency scan | Not run; dependencies unchanged |

New bug regressions failed before their fixes and passed afterwards. AI responses
were scripted; there were no paid LLM requests or production writes. API tests
ran outside the restricted sandbox so FastAPI TestClient could complete. One
existing Starlette/httpx deprecation warning remains. Local runtime: Python
3.13.13 and the installed frontend lockfile dependencies.

## Current product behavior and limits

Sandbox uses AI for journeys and investigation. Its settings explicitly set
`narrative="template"`, so Reveal does not automatically request an AI-written
report. This audit preserves that behavior. Runtime LLM output can still fail
validation, and production transport/key availability requires deployment checks.

## Scope, skills, and recovery

- Engine paths: `engine/sandbox.py`, `tests/test_sandbox.py`.
- Console paths: `console/src/sandbox/SandboxPanel.tsx`, `sandboxApi.ts`, and
  `SandboxPanel.test.tsx`.
- Extra artifact: this audit summary; no landing or deployment source changes.
- Existing untracked design/handoff files and TypeScript build artifacts were
  left untouched. Staging used explicit paths, separately for each module.
- Skills: agentic-workflow, systematic-debugging, test-driven-development, and
  commit-convention. Applied source tracing, failing tests, scope review, and
  local-only commits. No additional UI design or deployment skill was needed.
- Skip log: no new clarification was required; post-deployment checks and a
  rollback rehearsal were skipped because no deployment was in scope.
- Recovery: maintainer can revert the two implementation commits and rebuild;
  no data migration is involved. Rollback was not executed.

**Next step:** maintainer reviews/pushes these commits and redeploys the API image,
which also builds and serves the console. Verify a Sandbox in that environment.
The agent did not push or deploy.
