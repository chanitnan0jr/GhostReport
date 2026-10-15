# ENS simulated load and feedback

Use **ENS data → Report → Start ENS simulation** at
`/report/?project=ens`. The ENS journeys must be approved first.

Each visitor creates a separate synthetic run. Choose a batch size, feedback
delivery mode and answer preset, then select **Add simulated load + feedback**.
The report updates from server-computed counts and polls every three seconds.

## What is simulated

- Event sequences use analytics names present in the checked ENS Workflow Map.
  They are authored test sequences; this mode does not execute ENS or Playwright.
- The approved journey definitions classify these sequences. Unknown
  instrumentation coverage is never treated as verified absence.
- Exposures and feedback are synthetic. Modes exercise answers, skips,
  nonresponse, and questions not shown. Completed and inactive sessions are not
  asked. Options are shuffled, with Something else last.
- Answer presets are sampled independently of journey classification. The
  generic question/hypothesis presets are authored test fixtures, not ENS
  research hypotheses or real user statements.
- Only non-skip responses enter respondent denominators. Small groups remain
  Unresolved. Synthetic load does not establish instrumentation gaps or explain
  real ENS behaviour.

The question, options, event-path fixtures and approved journey definitions are
frozen before load is added. The simulation baseline digest stays stable as
load and feedback accumulate. This is separate from the DAO Mock's locked v1.

## Isolation and persistence

Runs are stored in `ens-simulations.sqlite` under the engine's database
directory, which is on the Docker volume. No generated records are written to
the DAO Mock event, exposure or response stores.

The creator's browser stores an owner token under a run-specific localStorage
key. A shared report URL is read-only in another browser. The token is never
included in the public report or exported generated records. New runs require
no LLM call or API key.

Limits: batches contain up to 200 synthetic sessions; a run holds up to 1000;
the local database permits up to 100 runs. A batch ID makes network retries
idempotent. Reusing an ID with different parameters is rejected.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/ens/simulations` | Create an isolated run from approved ENS journeys; returns its ID, owner token and empty report |
| `POST /api/ens/simulations/{id}/load` | Owner bearer token required; generate a batch of events and feedback |
| `GET /api/ens/simulations/{id}` | Read the synthetic report |
| `GET /api/ens/simulations/{id}/records` | Inspect generated sessions, events, exposures, responses and the frozen baseline |

Load body:

```json
{
  "batch_id": "a-client-generated-uuid",
  "n": 20,
  "seed": 42,
  "feedback": "mixed",
  "preset": "mixed"
}
```

`feedback`: `mixed`, `answered`, `skipped`, `unanswered`, or `not_shown`.
`preset`: `mixed`, `details`, `permission`, `cost`, or `other`.

The existing `/api/report`, `/api/events`, real probe endpoints and the static
ENS code review retain their existing contracts. ENS simulation has its own
report contract and does not claim to run the DAO-specific R2 policy on ENS.

## Local and mock mode

Start the existing Docker stack with the matching commit:

```sh
GIT_SHA=$(git rev-parse HEAD) docker compose up -d --build
```

Open `http://localhost/report/?project=ens`. Approvals and simulation runs survive
rebuilds while the volume is retained.

With `VITE_MOCK=1`, **Preview synthetic report** opens a static preview whose
counts were computed by the backend generator. It is read-only; the frontend
does not invent new counts when a button is clicked.

For browser-driven ENS flow validation, a separate ENS Playwright runner and
analytics adapter are still needed. The existing `scripts/seed/` runner drives
DAO Mock and is not presented as an ENS execution.
