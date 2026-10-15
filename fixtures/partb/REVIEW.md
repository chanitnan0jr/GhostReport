# Part B: code-only run on a dApp we did not write

| | |
| --- | --- |
| Target | [ensdomains/ens-app-v3](https://github.com/ensdomains/ens-app-v3) @ `3c10925fa042568d4affd6897d34e42159abd7a3` (MIT) |
| Mode | `code_only` (design §10, L0): no deploy, no code changes, no behavioral findings |
| Config | [ghostreport.ens.yaml](ghostreport.ens.yaml) |
| Output | [draft.ens.json](draft.ens.json), sha256 `9e84ca75f129c716c6bc293c2b78c9c18b46045b318cba91f217f7144399fd19` |
| Model | `deepseek-flash`, thinking off, prompts `stage_a.v1` and `stage_b.v1` |

The committed draft is the locked output. Re-running needs `DEEPSEEK_API_KEY` and may word
things differently; the guards (code refs, catalog-only actions, unmapped rules) apply either way:

```bash
git clone https://github.com/ensdomains/ens-app-v3 ../targets/ens-app-v3
git -C ../targets/ens-app-v3 checkout 3c10925fa042568d4affd6897d34e42159abd7a3
uv run python -m engine.analyze ../targets/ens-app-v3 fixtures/partb/draft.ens.json \
  --config fixtures/partb/ghostreport.ens.yaml
```

## What the engine found

- **Workflow Map:** 5 states, 12 outcomes, 5 UI facts across the registration flow
  (Pricing → Profile → Info → Transactions → Complete). Every outcome marked `found_in_code`
  is backed by one of the 14 `sendEvent(...)` calls the ContextPack extracted; 3 facts with
  invalid code refs were rejected by the guard.
- **Evidence gap:** on the Pricing step a visitor with no wallet sees `<ConnectButton large />`
  instead of Next (`Pricing.tsx:185`). Nothing records that this gate was shown or clicked.
  `wallet:connect` fires only after a successful connection (`src/utils/analytics/posthog.tsx:67`,
  outside the searched files, checked by hand). A visitor who reaches the gate and leaves is
  indistinguishable from one who never reached Pricing.
- **Cannot check R2:** the rule "HC-gate-permission requires that the gate was shown" needs
  `wallet_gate_shown`, which this repo does not emit. The engine dropped the proposed
  `check_event` action instead of running it on missing data.
- **Hypotheses (H1 to H4 + H_other):** browsing the price only; did not know a wallet was needed;
  unsure who is asking to connect; did not want to grant the permissions shown. All four cite
  Workflow Map IDs.
- **Recommendation:** instrument the step before connecting so H1 (never reached the gate) can
  be separated from H2 and H3 (reached it and stopped).

## Human check of the code refs

All 22 refs were read by hand against the source at the pinned commit
([review.json](review.json) has one verdict per fact): **19 correct, 2 wrong, 1 partial**.

| Fact | Verdict |
| --- | --- |
| `commit_ready_wait` at `Transactions.tsx:581-592` | **Wrong**: those lines are the `commitComplete` branch, not `commitReady` |
| `pricing_advanced` at `Registration.tsx:106-117` | **Wrong**: no availability condition; it sends `estimatedTotal ?? 0n` |
| `commit_start_pending` at `Transactions.tsx:386-390` | **Partial**: the 60-second wait is real but at line 265, outside the ref |
| the other 19, incl. the Connect gate at `Pricing.tsx:184-185` and all 12 outcomes | Correct |

## Limits

- The ContextPack hit the 30k-token cap (16 files, truncated); absence is claimed only within
  `scope.searched_files`.
- Hypothesis class definitions come from catalog `mvp-v1`, written for the grant app, so H1
  still says "did not intend to apply".
- DP1/DP2 probe options are what GhostReport would ask if ENS added L2 delivery; nothing was
  asked and no user data exists for this repo.
