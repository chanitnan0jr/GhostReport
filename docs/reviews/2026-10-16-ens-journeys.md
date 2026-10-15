# ENS journey definitions: operator review required

Validated LLM draft, not an approved or observed segmentation. The public site
loads only `journeys.ens.json` with reviewer, approval time and matching spec and
Workflow Map digests. It does not serve this draft. There are no ENS sessions.

- Repo: ensdomains/ens-app-v3 (MIT) at `3c10925fa042568d4affd6897d34e42159abd7a3`.
- Draft: `fixtures/partb/journeys.ens.draft.json`.
- Digest: `297a3e0208547b6237c5b867137778093561207db89f95a8f835883096d0c611`.
- Vocabulary: literal analytics calls in checked Workflow Map quotes. This does
  not claim to recover every analytics call in the original repository.
- Checks: schema, vocabulary, exact engine-resolved source refs, manual wrong-ref
  exclusion, wording, state order, catch-all and rule reachability.

## Review definitions

| Rule | Predicate | Evidence IDs |
| --- | --- | --- |
| Commit flow outcome recorded | `has(transaction:commit:send)` | `commit_sent`, `commit_start_pending` |
| Register completion recorded | `has(transaction:register:complete)` | `register_complete`, `registration_terminal_stop` |
| Commit failure recorded | `has(transaction:commit:fail)` | `commit_failed` |
| Registration override recorded | `has(transaction:register:override)` | `registration_override` |
| Profile submission recorded | `has(register:profile)` | `profile_advanced` |
| Info submission recorded | `has(register:info)` | `info_advanced` |
| No rule matched | `always (catch-all)` | `pricing_step_gate` |

## Review considerations

Rules are first-match. A hypothetical path with both commit-send and
register-complete enters the first group. Its label says "Commit flow outcome
recorded" while its predicate records a send. Review that ordering and wording.
Validation establishes references and rule validity, not the best segmentation.
The source map still contains its known wrong state reference with a review
badge, but this draft never cites that state as rule evidence.

## Approval after reviewing the full draft

Use your reviewer name; no approval was performed automatically:

```sh
uv run python -m engine.journey_cli approve fixtures/partb/journeys.ens.draft.json \
  --digest 297a3e0208547b6237c5b867137778093561207db89f95a8f835883096d0c611 \
  --approved-by '<reviewer name>' --out fixtures/partb/journeys.ens.json
```

Then review and commit the approved fixture and rebuild. The CLI refuses stale
references, digest mismatches and overwriting an existing output. ENS generation
and approval are never exposed as website controls.
