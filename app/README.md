# Micro Wallet Flow

GhostReport's investigation target. This directory runs independently of `engine/`, `console/`, and `roles/`.

```sh
cd app
npm ci
VITE_MOCK=1 npm run dev
```

Open `/app/` on the URL printed by Vite. On a phone use your computer's LAN address and allow port 5173. The development server listens on `0.0.0.0`. Append `?sid=YOUR_QR_SESSION` to preserve the QR-assigned session ID. With no `sid`, a UUID is stored in `sessionStorage`.

For the real engine, run `npm run dev` without `VITE_MOCK=1`. Vite forwards `/api` to `http://127.0.0.1:18000` without rewriting the path. Set `GHOST_API_TARGET` in the shell or app-local `.env.local` to change the backend URL. A production host must provide the equivalent same-origin `/api` reverse proxy.

```sh
npm test                  # Vitest: required instrumentation / eligibility checks
npm run build             # strict TypeScript + production bundle
npx playwright install chromium --no-shell
npm run test:browser      # desktop and mobile mock flow; RPC error rate fixed to 0
```

## Configuration

`VITE_MOCK=1` installs a development mock for fetch and sendBeacon from `src/mocks/backend.ts`. It does not contact the engine. Inspect `window.__GHOST_MOCK__` in browser devtools to see received events, exposures, and responses. It exists only when the mock is enabled. Set `window.__GHOST_MOCK__.failEvents = true` to exercise failed-ingest retry. Mock data resets on reload; the client outbox, sequence and session eligibility survive reload in `sessionStorage`.

`VITE_RPC_ERROR_RATE=0.10` is the default. The configured rate is clamped to 0–1 and shown in the mock popup. Only the first Connect attempt in a session can produce a simulated network error on Approve. Every retry succeeds on Approve, including after reloading. Use `0` or `1` for deterministic checks. Reject returns to the gate without recording a reject event; network errors remain recorded.

Both DP1 and DP2 plans are fetched independently on entering each ProjectPage. Not now selects DP1; Back selects DP2. A failed plan request disables only that decision point. Refreshing does not clear the session's asked flag. For a new investigation use a new `sid` or a fresh tab.

## Backend contract

All requests use same-origin `/api`. Client events omit `received_at`; the server assigns it. POST endpoints treat any 2xx response as acknowledgment. The event batch is retried unchanged after a failed request, with exponential backoff capped at 30 seconds, and sent by beacon on `pagehide`. Beacon delivery is best-effort, so unacknowledged events remain in the session outbox for deduplicated retransmission.

| Endpoint                                                         | Request                                                                                                                             | Response                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `POST /api/events`                                               | `{events: CanonicalEvent[]}`                                                                                                        | Any 2xx                                    |
| `GET /api/probe-plan?session_id=…&decision_point=DP1` (also DP2) | No body                                                                                                                             | `ProbePlan` or `null`                      |
| `POST /api/probe/exposure`                                       | `{exposure_id, plan_id, session_id, shown_at, client_cohort_at_shown, event_seq_at_shown, options_shown}`                           | Beacon; keepalive POST fallback if refused |
| `POST /api/probe/response`                                       | `{exposure_id, plan_id, session_id, shown_at, event_seq_at_shown, options_shown, responded_at}` plus `option_ids` or `skipped:true` | Any 2xx                                    |

See `src/types.ts` for complete event and plan types. `target_cohort` is a single canonical cohort string. Options are shuffled once per mount; the option whose label is `Something else` stays last. `Skip` is a separate control. DP1 plans missing `Not sure who is asking` are rejected, leaving the exit functional. No client cohort is authoritative: the engine must reconstruct it using events through `event_seq_at_shown`, waiting for late events as specified in the system design.

The exposure timestamp is taken on mount after the exit. `event_seq_at_shown` is the last behavioral event sequence including `not_now_clicked` or `back_nav`; the separate exposure beacon does not consume a canonical-event sequence number. The exposure endpoint is the `probe_shown` record. No extra canonical `probe_shown` event is emitted.

Response metadata is copied from the recorded exposure, including when skipping. This lets the backend reconstruct an exposure if its beacon is lost. Retries preserve the complete response payload, including timestamps.

There is no real blockchain, extension, address, analytics SDK, LLM, or form submission service. Form text stays in component state/DOM and is never tracked or persisted.

## Scope and assumptions

Consent governs the optional feedback question. Either choice permits using the demo. Escape from the gate acts as Not now; Escape from the popup acts as Reject. Visible Back and browser Back are tracked on leaving ProjectPage. The application completion is local demonstration only.

Tests passing locally establish the behavior of this source revision. The engine owns `build_verified` and should associate that flag with the exact app build/commit after running the required checks. Browser test success is not live-backend integration verification. API timeout/malformed plan disables the probe; exits never await it. A missing beacon or failed Skip delivery remains nonresponse and must be reported as a coverage limitation.

## Real backend E2E

Start the provided locked demo backend from the repository root. These commands create a fresh local test run and never call the LLM:

```sh
uv run python -m engine.demo verify
uv run python -m engine.demo serve --run-id e2e --fresh --port 18000
```

Then, from `app/`:

```sh
GHOST_E2E_REAL=1 npm run test:browser
# Or use an already running / deployed single-origin site:
BASE_URL=https://your-demo.example npm run test:browser
```

`e2e/full-loop.spec.ts` checks DP1 Not now, DP2 Back, and Skip on desktop and a 375 px viewport. The answer tests select the required Something else option, verify H_other's numerator/denominator and the correct exposure cohort, and drop the beacon to exercise response recovery. The suite adds synthetic sessions; use an isolated run with open plans, not the judging population. Default mock browser tests start their own server on 18176; override with `GHOST_E2E_PORT`.

Production builds use `base: '/app/'`. Both `/api` and `/roles` use `GHOST_API_TARGET` in development. For cross-app navigation with shared localStorage during development, enter through the landing server on 5175, which proxies `/app/` and `/report/` to the two Vite servers.
