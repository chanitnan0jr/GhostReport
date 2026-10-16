# Journey predicate contract fix

**Date:** 2026-10-16  
**Branch:** main  
**Implementation commit:** ff97a2f  
**Status:** Verified locally; awaiting human push and deployment  
**Risk:** Medium (journey generation contract)  
**Approval:** User explicitly authorized engine, prompt, and regression-test edits.

## Goal and evidence

Reproduce and fix the generated-journey error where `lacks` receives multiple
events, including inside a compound predicate. The runtime accepts exactly one
event for `has`/`lacks`, but the old published schema specified only a generic
maximum of twenty events. The old task prompt and repair error did not state the
missing operator-specific cardinality. A direct model-validation reproduction
and failing regression tests established this mismatch before implementation.

## Changes

- `engine/segment_spec.py`: share the event arity table between runtime validation
  and conditional JSON Schema; publish argument shapes for all operators; report
  actionable cardinality errors; request the new task prompt version.
- `prompts/journeys.v2.md`: explain exact cardinalities and provide explicit
  `all`/`any` examples for multiple absence conditions. Preserve v1 for auditability.
  Clarify that an allowed event name does not prove the app emits that event.
- `tests/test_segment_spec.py`: eight additional cases covering schema cardinality,
  the reported invalid `lacks`, compound absence semantics, unknown coverage,
  successful bounded repair, prompt version, and withholding invalid output.

There is no automatic interpretation of a multi-event absence predicate. Both
`all` and `any` remain available, with their original different semantics.
The original cohort template, approved definitions, locked v1, report counts,
wallet instrumentation gap, authentication, and retry limits are unchanged.

## Verification

| Check | Result |
| --- | --- |
| New regression cases before implementation | Seven failed at the missing schema/error contract; one preservation case passed |
| Focused cases after implementation | 8 passed |
| Full journey suite | 30 passed |
| Full backend suite: `.venv/bin/python -m pytest tests/ -q` | 122 passed |
| Ruff on both changed Python files | Passed |
| Strict mypy on both changed Python files | Passed |
| `git diff --check` and staged diff check | Passed |
| Live DeepSeek / Railway verification | Not run; no paid call or remote mutation |
| Dependency scan | Not run; no dependency changes |

Tests used scripted LLM responses. Full API tests ran outside the sandbox after
the sandboxed FastAPI TestClient run stalled and was interrupted. Local runtime:
Python 3.13.13, pytest 9.1.1. One existing Starlette/httpx deprecation warning
remains. This is local verification, not a production success claim.

## Scope and skills

- Planned and actual implementation paths: the three files listed above.
- Additional artifact: this summary. No unrelated tracked files changed; existing
  untracked design, handoff, and TypeScript build artifacts were left untouched.
- Skills: agentic-workflow, systematic-debugging, test-driven-development,
  commit-convention. Applied evidence gathering, failing regression first,
  bounded repair, scope review, explicit staging, and local-only commits.
- References: intake/risk, research, skill loading, safety, execution,
  verification, self-review, and summary template from agentic-workflow.
- Skip log: clarification was already resolved by the user's authorization;
  post-deployment checks and rollback rehearsal were skipped because no remote
  deployment was authorized. No additional language or UI skill was needed.

## Remaining risk and recovery

An LLM can still return invalid output. Such output remains rejected after the
existing bounded repair and is never approved automatically. Existing drafts
and approvals are not rewritten. New calls use the v2 prompt/cache identity.

The maintainer should push the local commits, redeploy the API service, then
request a new draft and review it. The gateway requires no change for this fix.
Rollback: maintainer reverts ff97a2f and redeploys the previous API image; no data
migration is involved. Rollback was not executed. The agent did not push.
