# ENS journeys: corrected draft awaiting owner approval

Draft: `fixtures/partb/journeys.ens.draft.json`, version 2.
Digest: `596704bcf58ce8a5b4821198506633960101777ad730f75e1fee453c969a7f16`.
Source: the existing LLM draft with explicit editorial corrections recorded in
`revision_notes`. No human approval has been recorded. The validated draft is
available as a read-only preview on the ENS Segments page, labelled as awaiting
operator approval.

## Corrections

- Registration completion precedes commit-send, so an earlier send does not
  override a later completion when both are present.
- "Commit flow outcome recorded" is renamed "Commit send recorded" to match its
  actual event. Code refs and the pinned ENS workflow are unchanged.
- Rules are first-match groups of recorded events, not latest transaction status
  or inferred intent. No actual ENS sessions or counts exist.

| Priority | Rule | Event |
| --- | --- | --- |
| 1 | Registration completion recorded | `transaction:register:complete` |
| 2 | Registration override recorded | `transaction:register:override` |
| 3 | Commit failure recorded | `transaction:commit:fail` |
| 4 | Commit send recorded | `transaction:commit:send` |
| 5 | Profile submission recorded | `register:profile` |
| 6 | Info submission recorded | `register:info` |
| 7 | No rule matched | `catch-all` |

## Validation

The corrected draft passes schema, vocabulary, exact code-reference, wording,
state-order, catch-all and reachability checks. The known wrong references in the
original Workflow Map remain labelled there and are excluded as rule evidence.

The API validates the committed draft before returning it and its code-only
graph. It does not assign sessions, create counts, or mark the draft approved.
Approval of this exact digest is still required before creating the approved
fixture. Visitors cannot generate or approve ENS definitions. Following the
owner's clarification that the missing Approve button should be available,
authenticated operators can now approve the prepared draft on the website.
ENS generation remains offline.

## Approve after review

### Operator page

1. Open `/report/?project=ens&operator=1#segments`, or use the draft's
   "Review and approve this draft" link.
2. Enter the configured `GHOST_OPERATOR_TOKEN`, unlock operator tools, and enter
   the reviewer's name. Select **Approve reviewed definitions**.
3. The server validates the exact digest and code refs and saves the approval
   to `journeys.ens.approved.json` in its persistent database directory. It
   survives a process restart, run switch, or Docker rebuild with the volume
   retained. No LLM call is made, and the report and locked v1 are unchanged.
4. Use **Download approved fixture**, save it as
   `fixtures/partb/journeys.ens.json`, and commit it for deployment. The repository
   fixture takes precedence over the server-local approval when present.

Operators cannot overwrite an existing approval. Public views stay read-only.
Merely unlocking the form does not authenticate an approval: the server checks
the bearer token on the request.

### Terminal alternative

```sh
uv run python -m engine.journey_cli approve fixtures/partb/journeys.ens.draft.json \
  --digest 596704bcf58ce8a5b4821198506633960101777ad730f75e1fee453c969a7f16 \
  --approved-by '<reviewer name>' --out fixtures/partb/journeys.ens.json
```

Commit the approved fixture and rebuild with GIT_SHA. The website then displays
proposed journeys from code, read-only for visitors, with no behavioural counts
or generation controls. Approval is not a claim that the proposed segmentation
is observed.
