# ENS generated journey display

**Date:** 2026-10-16
**Branch:** main
**Status:** Local implementation and browser checks complete; not pushed
**Risk:** Low; approval of the ENS definitions remains pending

## Summary

The LLM-generated ENS proposal already existed, but the API only loaded the
approved fixture. Since that fixture did not exist, the page incorrectly looked
as if generation had never happened.

- Load the committed ENS draft, validate it, and expose its proposed graph for
  review. Keep `approved: null` until the offline approval command is used.
- Label the graph as a code-only proposal awaiting operator approval. Return no
  session counts. Keep website generation and approval disabled for ENS, as the
  handoff specifies. The initially suggested website operator flow was narrowed
  to this read-only review after re-reading that constraint.
- Reuse draft version 2, digest
  `596704bcf58ce8a5b4821198506633960101777ad730f75e1fee453c969a7f16`.
  It contains the existing LLM proposal with editorial corrections documented in
  its revision notes. No fresh LLM call or automatic approval occurred.
- Withhold malformed, stale, mismatched-kind and digest-invalid draft files.
  Existing Mock rules, report counts and locked v1 are unchanged.

## Files changed and scope check

Planned and actual paths match; no unexpected files were staged:

- `engine/journey_api.py`
- `tests/test_segment_spec.py`
- `console/src/GeneratedJourneys.tsx`
- `console/src/GeneratedJourneys.test.tsx`
- `console/src/ProjectSelection.test.tsx`
- `docs/reviews/2026-10-16-ens-journeys.md`
- This summary

The owner handoff, unrelated untracked design files and TypeScript build caches
were preserved.

## Verification

- Backend: 104 tests passed; strict mypy passed for 30 modules.
- Frontend: console 39, landing 15 and app 39 tests passed; all type checks passed.
- Console formatting and landing formatting passed; changed Python files pass
  Ruff. Global Ruff still reports the nine previously documented E501 warnings
  in policy, reconcile and storage; they were not modified.
- Projector Playwright suite: four checks passed.
- Docker rebuild: all three production frontend builds and the gate-exposure
  instrumentation test passed. Existing volumes were retained.
- Actual localhost API: HTTP 200, validated draft present, approval null,
  code-only graph present with no behavioural counts.
- Actual localhost browser at 1440px: graph rendered, no horizontal page
  overflow, no page errors, and no ENS mutation controls. Screenshot:
  `/tmp/ghostreport-ens-journeys-live.png`.
- No dependency changes; dependency scan not run. Production was not deployed.

## Skill usage and skip log

- Applied `agentic-workflow`: repository evidence, scoped edits, explicit
  staging, Conventional Commits, saved report, no secret output, no push.
- References: skill instructions and summary-report template.
- Skipped broad design work and production deployment procedures because this
  fixes an existing draft read path and only updates the local Docker instance.
- Hand-off verification commands used the existing virtualenv directly instead
  of uv; the checked source and test suites are unchanged.

## Assumptions and remaining risk

- Validated: the committed proposal passes the deterministic definition checks.
- Human approval remains separate from validation. The preview is available for
  review and makes no claim of observed ENS behaviour or approved definitions.
- The workflow retains its manual reference-review limitations and exposes them
  on the graph. No new source-analysis claims were introduced.

## Version control and recovery

Module commits, neither pushed:

- `3412745` — engine draft loading, isolation checks and review documentation.
- `80ab7f9` — console draft presentation and display checks.

This report is committed separately. Recovery: revert these local changes and
rebuild the local Docker image; no database migration or volume removal is
needed. Rollback was not rehearsed. Owner: project maintainer.

## Next step

Review the draft at `/report/?project=ens#segments`. When an operator approves
the exact digest, use the command in `docs/reviews/2026-10-16-ens-journeys.md` to
create the approved fixture. Approval is not needed to inspect this preview.
