# GhostReport landing

Public entry point at `/`: GhostReport, with the recorded demo embedded on Home. Requires Node 22.13 or newer.

```sh
cd landing
npm ci
VITE_MOCK=1 npm run dev    # http://localhost:5175/
npm test
npm run build
npx playwright install chromium --no-shell
npm run test:browser
```

The GhostReport guide is at `/about/`; integration levels and the System Design §10 config example are at `/install/`. L3 is explicitly a roadmap item.

## Home + demo

Home follows the approved ink-mountain reference: serif headings, a floating shared
header, four horizontal process cards, the featured Common Ground DAO app,
real Playwright recordings, and ENS/installation links. Home styling lives in `src/home.css`;
other landing routes keep the light page shell.
**Watch the demo** and **Watch simulated users** scroll to `/#demo` on the same page.
`/seed/` remains the detailed recording/session explorer. `/try/` is a compatibility
redirect to `/app/`, preserving the query and hash. Home and the DAO Mock pill link
directly to `/app/`. The shared header uses Home, Segments, Workflow Map, Report,
Install, with a GhostReport / DAO Mock switch beside GitHub.
ENS and About remain accessible from Home.

`useHomePopulation` reads `/api/report` every three seconds and derives source counts
from `current.sessions` plus `current.session_sources`. It never assumes 20 sessions,
never treats seed/test sessions as visitors, and withholds counts if source metadata
is missing. Mock mode uses the existing sample population, which may differ from
recordings. Counts describe the current run; clips are saved seed run artifacts.

The four `.webm` recordings and matching `.json` logs are static files in
`public/demo/`. Home reuses the full-size `DemoClips` player from `/seed/`:
four portrait videos up to 460px tall, **Play all four**, visible timed event logs,
and segment results. Each log follows its own video's playback time. Portrait
recordings use `object-fit: contain`; there are no people illustrations or
invented reject events. Posters were extracted from those recordings with
ffmpeg, without changing the videos.

Home's featured player adds numbered headings, descriptions and individual play
buttons; the full recordings remain 460px tall as requested. Native video controls
appear after starting a clip. The original `/seed/` player remains available.

`public/images/ink-mountains.png` is decorative artwork generated from the approved
reference with all UI/text removed. The ghost logo remains in the shared header.
`public/images/common-ground-preview.png` is a real screenshot of the app's project
list intro, captured with a test-prefixed session and no feedback consent. The
user-supplied DAO logo remains unframed beside the featured app description.
No wallet extensions, invented events, screenshots of fictional app flows or
synthetic visitor counts are introduced by the redesign.

Desktop visual review uses 1448×1086 (reference size) and 1280×960. Unit/E2E suites
and mobile checks were not run for this redesign.

## Direct app entry and session boundary

Public entry opens the DAO app's “A small start. A shared future.” consent screen.
There is no introductory Try page or role card in this route, and entry does not
call `/roles/assign`. Existing role-card components/tests describe the earlier
experiment and are no longer imported by the public landing entry point.

The app owns the session ID: it uses `?sid=` when present, otherwise a tab session
or a new UUID, and saves the same ID as `localStorage['ghost:judge_sid']` so the
report can highlight it. No role is sent to `/api/*`. Optional questions require
consent and a session that has never clicked Connect, in addition to the loaded
plan and exit eligibility. A rejection or network error does not restore eligibility.

## Single-origin development

Start all three Vite servers, with `GHOST_API_TARGET` (default `http://127.0.0.1:18000`) and `GHOST_ROLES_TARGET` (default `http://127.0.0.1:18100`):

```sh
# Separate terminals, from the repository root:
npm --prefix app run dev             # 5173
npm --prefix console run dev         # 5174
npm --prefix landing run dev         # 5175
```

Enter through **http://localhost:5175/**. Its dev proxy sends `/app/` to 5173 and `/report/` to 5174, including Vite WebSockets; `/api` goes to `GHOST_API_TARGET`; `/roles` goes independently to `GHOST_ROLES_TARGET`. This preserves the same origin and session highlight while moving between apps. For mock previews set `VITE_MOCK=1` independently for each server.

In production the engine serves `landing/dist/` at `/`, `app/dist/` at `/app/`, and `console/dist/` at `/report/`, with API and roles routes on that origin. Deployment files and the separate roles process belong to the backend owner.

## Verification

The earlier role-card unit and browser tests describe the retired entry flow. They were not updated or run for the direct-entry change. Build checks cover TypeScript and production bundles; manual browser review checks the current public route.

For a complete single-origin check against built or deployed frontends:

```sh
BASE_URL=https://your-demo.example npm run test:browser
```

`e2e/site.spec.ts` still describes the earlier assigned-role entry and needs alignment before it can validate the new direct entry. App-local full-loop checks enter `/app/` directly. All synthetic sessions must use the `e2e-` prefix and a dedicated test run.

## Separate roles service

Start it in a separate terminal from the repository root, with `ROLES_SEED` supplied in the server environment:

```sh
uv run uvicorn roles.service:app --port 18100
```

The service owns its own SQLite database and assignment randomization. `GET /roles/health` exposes only health, a seed hash and assignment count. The public direct-entry flow no longer calls this service. Historical assignment requests used UUIDs; repeated requests for the same session return the same role. Never place the seed or operator token in a `VITE_` environment variable or client bundle.

## Reviewed ENS investigation

**Tested on a real repo: ENS** links to `/ens/`. This is a second static
Vite entry (`ens/index.html`), so the engine can serve the built directory
without a new backend route or SPA fallback. It fetches only `GET /api/partb`;
loading this page never starts an analysis or calls an LLM. `VITE_MOCK=1`
uses the committed Part B draft and human review fixtures.

The page displays the API finding, pinned GitHub references, all flow-map
rows, reviewer verdicts/notes, unavailable rule checks and verbatim limits.
Hypotheses and recommendations are deliberately omitted from this page.
The existing wording guard redacts restricted report terms in source descriptions; the pinned code link and human verdict remain visible.

Browser checks cover direct loading and the landing link at desktop and
375 px widths. The complete `BASE_URL` suite also follows the public report
link to ENS. Its synthetic UUIDs carry the `e2e-` prefix and must be labeled
`test` by the backend, never `visitor`.

The recorded `/demo` page is deferred until Friday after G2. No production
browser automation or video replay has been added by this change.

## Public navigation

Home is GhostReport at `/`. The shared header's DAO Mock pill and the featured
app link open `/app/` directly. Legacy `/try/` bookmarks redirect there without
showing an introduction or role card. Start all three dev servers and enter
through port 5175 for one origin; direct app/console ports do not host the
landing routes. Each landing route is a separate built HTML entry compatible
with the existing static-file server.

`/seed/` reads `/api/report`, selects only sessions explicitly labeled seed
in `current.session_sources`, then reads `/api/seed-sessions/{session_id}`.
It displays the recorded cohort, coverage, event sequence, server timestamps
and optional response. Refresh is read only: it never launches browsers,
creates sessions or submits answers. Missing data and failed requests have
visible empty/error states. No visitor or test session detail is requested.

`VITE_MOCK=1` supplies clearly labeled local preview data for this page;
it is not represented as a recorded Playwright run. The video-based `/demo`
remains deferred until Friday after G2.
