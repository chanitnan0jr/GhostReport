# ENS page and source-aware report handoff

Date: 2026-10-15 · main · local verification; no push or deployment

## Scope

Pulled main with `git pull --ff-only` (already current at d086705).
Read the current System Design and Core Paper Review context. Applied the
agentic-workflow and existing React practices. Edited only app/, console/
and landing/. No backend, roles, seed-script, fixture or deployment changes.

## Changes

- Landing links to `/ens/`, a second static Vite HTML entry. The production
  output includes `landing/dist/ens/index.html`; no engine route is needed.
- ENS fetches only `/api/partb` and presents the API finding title/text,
  pinned source links, repository/commit/license, read-only mode, 22 flow
  facts, reviewer notes and the 19 correct / 2 wrong / 1 partial summary.
- R2's missing event is explicit. Limits are verbatim, including the
  16-file / 30k-token truncation. No hypotheses or recommendations appear.
- One technical transaction term in a model description hits the previous
  report vocabulary restriction. Only that word is redacted as
  `[restricted wording]`; its pinned source and review verdict stay visible.
  Finding text and limits are not rewritten.
- Console shows current.population and validated source counts, exact
  source-aware finding.text, per-source respondents, and Your session's
  authoritative source. Seed is labeled
  `Simulated users (Playwright) — seed`. Aggregate funnel counts are labeled
  Recorded sessions. Combined coverage is explicit.
- All automated full-loop sessions retain the e2e- prefix. Tests assert the
  backend labels them test and visitor respondent counts do not increase.
  Cohort/finding assertions wait for batched exit-event ingestion.

## Verification

| Check | Result |
| --- | --- |
| App unit | 38 passed |
| Console unit | 17 passed |
| Landing unit | 8 passed |
| Production builds | All three passed, including TypeScript |
| App real API E2E | 6 passed: DP1, DP2, Skip on desktop and 375 px |
| Console mock browser | 6 passed |
| Console real API browser | 2 passed; updates in 1966 ms and 2496 ms |
| Landing + ENS browser | 4 passed on desktop and 375 px |
| Built single-origin flow | 2 passed with real engine and real roles |
| Instrumentation verification | Real gate-exposure test passed |
| Whitespace review | git diff --check passed |
| Historical secret-pattern scan | 223 blobs, zero findings before commits |

The initial browser JSON-import failure was fixed with explicit JSON import
attributes. Earlier ingestion timing failures were fixed with condition
polling. Concurrent landing browser commands collided in their shared
trace directory; the suite was rerun alone. No test is skipped or quarantined.

Real checks used an isolated locked pilot run on 18200, roles on 18201 with
its own temporary DB and secret seed, and a temporary static host on 18180.
No LLM call was made, no live visitor database was modified, and no role
field was sent to the engine. Screenshots were inspected at 375 px.
The public deployment and final engine static configuration were not tested.

## Contracts and remaining work

All required fields are supplied by the API. Per-probe source coverage is
not supplied; the UI labels those counts combined rather than fabricating
visitor-only numbers. Legacy fixtures without source fields show an honest
unavailable state.

The existing Part A investigation reports seven stale app code references.
Backend owner must refresh analyze + review + prepare and verify on the
final deployment commit. The local E2E run's matching gate verification
was true; its other old references were not silently repaired.

`/demo` is intentionally deferred until Friday after G2. Its clips and
recorded event timeline must be static, labeled seed, and must not launch
Playwright in production. Railway domains and deployment remain with the
user/backend owner.

## Commits and rollback

- App: ac82a87 — source-aware probe E2E and ingestion waits.
- Console: 2fc0a39 — source population and respondent splits.
- Landing: the commit containing this summary — reviewed ENS route and tests.

Each module is committed separately with Conventional Commit messages.
Revert a module commit to roll back its changes; no database migration is
involved. No push was performed.
