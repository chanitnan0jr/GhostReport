# Frontend judging handoff

Date: 2026-10-15 · Branch: main · Status: local frontend checks passed; deployment pending

## Goal and scope

Prepare the public landing, grant app and investigation report for asynchronous judging, preserving the System Design's evidence and privacy boundaries. Read both `GhostReport — Core Paper Review.md` and `GhostReport — System Design.md` completely before final alignment.

- Edited only `app/`, `console/`, `landing/`.
- Engine, roles, fixtures, prompts, root tests and deploy files remain owned by the backend developer. Their concurrent working-tree changes were excluded from frontend commits.
- Risk: Medium for frontend behavior; operator token transport was explicitly requested. Server authorization and deployment are separate responsibilities.

## Changes

| Module  | Changes                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app     | Remove reject analytics and its flag; keep RPC error events; default to a 0.10 error chance on the first session attempt only; retries succeed; clearly label the simulation; remove internal-facing UI wording; use `/app/`; add real API E2E with `BASE_URL`.                 |
| console | Use `/report/`; hide operator tools from public visitors; prompt once for a memory-only bearer token; show reviewable drafts; render authoritative per-event verification and exact commits; highlight the visitor's session; retain all nine panels and evidence/count guards. |
| landing | Three public steps, exact English A/B role cards, session-only role assignment, UUID handoff, L0–L3 explanation, design config example, GitHub links, and single-origin development proxies.                                                                                    |

The app's existing dual-plan preload, exit-event sequence capture and response fallback metadata were retained and checked against the real engine. No analyzer-facing hints were added to app source. Self-report remains separate from observations; low n remains neutral; role data never enters the engine.

## Verification

| Check                    | Result                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| app unit                 | 38 passed                                                                                               |
| console unit             | 14 passed, including token presence/absence and unverified event handling                               |
| landing unit             | 5 passed, including exact A/B copy and assignment retry identity                                        |
| Builds                   | All three `npm run build` commands passed, including TypeScript                                         |
| app mock browser         | 24 passed: 12 desktop/mobile cases repeated twice                                                       |
| app real API E2E         | 6 passed: DP1, DP2, Skip on desktop and 375 px                                                          |
| console mock browser     | 6 passed: nine panels, mode banner, counts, manual digest, 409                                          |
| console real API browser | 2 passed; answer → public report took 2005 ms and 1989 ms                                               |
| landing browser          | 2 passed: desktop and 375 px                                                                            |
| Built single-origin site | 2 passed with real engine and real roles service; an additional 2 passed earlier with only roles mocked |
| Visual inspection        | Inspected projector report, 375 px landing and role card screenshots                                    |
| Dependencies             | Landing full dependency audit: zero known vulnerabilities                                               |
| Secret scan              | Frontend source/config scan found no credential patterns; no real tokens were stored or committed       |

Earlier browser setup/test assumptions were corrected before the final successful runs: installed Chromium location, waiting for a preloaded plan before testing Back, and selecting the stable required Other option instead of assuming LLM option wording. No final test is quarantined or skipped.

Environment: local Linux, Node 22, npm, Chromium. Real E2E used the backend's `engine.demo serve` with an isolated database under `/tmp` on port 18001. No LLM request was made by these tests. A temporary static host served the built frontends on one origin, routing to a separate real roles service on 18101 with its own `/tmp` database. The production engine's static serving and public hosting remain unverified.

## Backend handoff and remaining work

1. App code is ready for analyze → review → prepare. The existing investigation warned of seven stale code refs after the requested wallet/copy changes. Refresh the investigation before deployment.
2. Commit the final frontend and investigation files before running `engine.demo verify` for deployment. Verification is tied to the exact HEAD (including a dirty-tree fingerprint); a later commit changes the identifier. The console preserves dirty suffixes and shows false verification honestly as `unverified`.
3. No additional API fields are required for this frontend task. `run.verification[event]` is implemented exactly as supplied: `verified`, nullable `commit`/`test`, optional nullable `passed_at`. Raw `run.verifications` is ignored.
4. The backend owner must enforce Bearer authorization for operator endpoints. Client visibility is not authorization. Client tests cover attaching tokens to draft/analyze/approve/lock/snapshot and withholding them from public GET report.
5. Real `POST /roles/assign {session_id}` integration passed with the supplied separate service. All three dev proxies independently route `/api` through `GHOST_API_TARGET` (default 18000) and `/roles` through `GHOST_ROLES_TARGET` (default 18100); Vite configuration resolution was checked with independent overrides. The frontend never substitutes a role after a real assignment failure.
6. Seeded judging runs, live-run separation, roles randomization/seed hash, static serving, persistent SQLite disk and hosting belong to the backend/deploy owner. No account was available to this agent and no deployment was performed.

Optional older report enrichments remain documented in `console/README.md`: eligible reach counts, v1 funnel/probe totals, raw evidence drill-through and historical trace metadata. The frontend does not invent these values.

## Run

Run `npm ci` in each frontend directory. Start app on 5173, console on 5174, and landing on 5175; enter through `http://localhost:5175/` for shared storage and navigation. Set `GHOST_API_TARGET` (default `http://127.0.0.1:18000`) and `GHOST_ROLES_TARGET` (default `http://127.0.0.1:18100`) consistently. `VITE_MOCK=1` enables each module's local preview. See each module README for test commands and deployed `BASE_URL` checks.

## Version control

- `504ef5e` — `fix(app): align wallet flow and verify exits`
- `4052726` — `feat(console): add public judging report`
- `2569547` — `fix(app): split the roles development proxy`
- `03d8913` — `fix(console): split the roles development proxy`
- Earlier app/console commit IDs changed during the maintainer’s history reorganization; the IDs above reflect the current history.
- Landing and this handoff are in the subsequent `feat(landing)` commit.
- Conventional Commit subjects and detailed validation bodies; module-scoped staging only. No push.

## Skill usage and skip log

- Applied `agentic-workflow` for scope checks, source review, verification, local commits and this report; commit convention reference for messages. Applied React best-practice guidance for hooks, request cleanup, conditional mocks and explicit event handlers.
- Skipped deployment/post-deploy checks because deployment belongs to the other owner. No external paper evaluation, LLM evaluation, blockchain or analytics SDK was added.
- Read the local design/review as project context; the frontend does not claim causal identification or policy superiority over fixed surveys.

## Recovery and next step

Recovery: revert the relevant frontend module commit after coordinating with the backend owner, then rebuild that module. No schema migration or production data change is included; rollback was not rehearsed. Owner: project maintainer.

Next: backend owner refreshes the investigation, configures authorization and production static routing, verifies the final deploy commit, then runs the same `BASE_URL` checks on the persistent public deployment. Review the local commits before pushing.
