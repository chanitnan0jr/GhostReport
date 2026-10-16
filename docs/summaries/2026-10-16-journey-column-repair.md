# Journey column validation and cache repair

**Date:** 2026-10-16

**Branch:** main

**Implementation commit:** 035ec46

**Status:** Verified locally; awaiting human push and deployment

**Risk:** Medium; optional LLM validation callback and journey generation

## Reported behavior and evidence

The Sandbox screenshot displayed only “columns must follow every Workflow Map
state in order”. That guard rejects missing, reordered, duplicate, unknown, or
non-state columns. The rejected production draft was not available, so the exact
mismatch in that request is not established.

Source inspection and local reproductions identified two weaknesses:

1. The model inferred required columns from a mixed list of states, outcomes,
   and UI facts. Domain repair received a generic error without the previous
   answer or expected/received column lists.
2. The LLM harness cached schema-valid output before journey domain checks.
   Consequently a definition rejected by the workflow guard could still be
   cached and returned again for an identical Generate request.

## Changes

- Derive an authoritative ordered `required_columns` scaffold from checked
  Workflow Map states. Include states with no recorded events; do not synthesize
  counts or silently accept a malformed column list.
- Report expected and received state IDs on a column mismatch.
- Add immutable prompt `journeys.v3`; preserve v1 and v2.
- Add optional domain validation to `LLM.call`, before cache insertion and on
  cache reads. A normal request evicts a domain-invalid cache entry; replay
  refuses it without calling the provider.
- Journey generation now uses that validation boundary for all existing guards.
  Repair sees the original assistant answer and specific validation problems.
  Schema and domain checks share one repair: at most two completions total.
- Preserve the public result shape, full domain errors, strict predicate rules,
  approved definitions, original cohort template, and locked v1.

## Verification

- Ten new regression cases cover malformed column lists, successful and failed
  repair, retrying after a failed generation, valid cache reuse, and rejecting
  an invalid existing cache record in normal and replay modes.
- New column/repair and invalid-cache cases failed before their fixes.
- Full backend suite: **137 passed**, including the Sandbox flow and restart
  checks. One existing Starlette/httpx deprecation warning remains.
- Ruff and strict mypy passed for `engine/llm.py`, `engine/segment_spec.py`, and
  `tests/test_segment_spec.py`. Diff whitespace checks passed.
- Provider responses were scripted. No paid DeepSeek call, production database
  write, push, or deployment was performed.
- Frontend builds were not rerun; no frontend source changed. Dependency scan
  was not run because dependencies did not change.

## Scope, skills, and remaining limits

Implementation paths: the three Python files above and `prompts/journeys.v3.md`.
This summary is the only additional artifact. Existing untracked design, handoff,
and build files were left untouched.

Applied agentic-workflow, systematic-debugging, test-driven-development, and
commit-convention: source tracing, failing regressions, bounded validation,
explicit staging, and local commits. No new clarification was needed. Deployment
checks and rollback rehearsal were skipped because remote deployment was not in
scope. This is local verification, not a production success claim.

The LLM may still return an invalid answer after repair; it remains withheld and
is not cached. Sandbox AI budgets still apply when an actual completion is made.

**Next step:** maintainer pushes the local commits, redeploys the API image, and
requests a new draft if the Sandbox has remaining AI quota. No API key change or
gateway configuration change is part of this fix. Rollback is a maintainer revert
of 035ec46 and API rebuild; no data migration is involved. Rollback was not run.
