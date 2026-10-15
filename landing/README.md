# GhostReport landing

Public entry point at `/`. Requires Node 22.13 or newer.

```sh
cd landing
npm ci
VITE_MOCK=1 npm run dev    # http://localhost:5175/
npm test
npm run build
npx playwright install chromium --no-shell
npm run test:browser
```

The page has three steps: try the grant app, view the investigation, and inspect the four integration levels plus the System Design §10 config example. L3 is explicitly a roadmap item. Role card copy is exactly the approved English text in System Design §7.

## Roles and session boundary

Clicking **Try the app as a user** creates a UUID and sends only `{session_id}` to `POST /roles/assign`. A valid `{role:"A"|"B"}` response displays the card and one **Start** button. Start navigates to `/app/?sid=…`. Assignment failures offer a retry using the same pending session ID; the frontend never invents a role on failure.

Only the session ID is stored as `localStorage['ghost:judge_sid']`. The role remains in component memory, never in a URL or web storage, and is never sent to `/api/*`. The service owns randomization and assignment persistence. In mock mode only, a local interceptor alternates A/B to preview both cards.

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

Unit tests check exact A/B copy, session-only requests/storage, retry identity, invalid responses and integration links. Playwright checks desktop and 375 px width, the card, no role transmission to the engine, and the `/app/?sid=` destination. It uses a routed mock of the roles endpoint; real roles-service verification uses the separate process described below.

For a complete single-origin check against built or deployed frontends:

```sh
BASE_URL=https://your-demo.example npm run test:browser
```

`e2e/site.spec.ts` follows landing → assigned role → app → Not now → answer → public report, verifies the shared session highlight and all nine panels, and checks that no role field reaches `/api/*`. It requires a locked test run with open plans and creates synthetic sessions. Use a dedicated test deployment. `GHOST_MOCK_ROLES=1` explicitly mocks only role assignment when the separate service is unavailable; the app/report API stays real.

## Separate roles service

Start it in a separate terminal from the repository root, with `ROLES_SEED` supplied in the server environment:

```sh
uv run uvicorn roles.service:app --port 18100
```

The service owns its own SQLite database and assignment randomization. `GET /roles/health` exposes only health, a seed hash and assignment count. The landing sends valid UUIDs; repeated assignment requests for the same session return the same role. Never place the seed or operator token in a `VITE_` environment variable or client bundle.
