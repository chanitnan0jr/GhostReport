# GhostReport operator console

Requires Node 22.13 or newer. This directory owns only the presentation and operator controls; it does not implement investigation rules.

```sh
cd console
npm ci
VITE_MOCK=1 npm run dev   # http://localhost:5174
```

Mock mode imports `../fixtures/report.sample.json` directly without rewriting or duplicating it. The fixture is visibly labeled **SEED DATA**. Mock snapshot requests validate the pasted digest and return 409 for a mismatch. Mock snapshots are local to the page and reset on reload.

For the real backend, run `npm run dev` without `VITE_MOCK=1`. `/api` proxies to `http://127.0.0.1:18000`. `GHOST_API_TARGET=http://127.0.0.1:18001 npm run dev` can point a local verification session at an isolated API instance; the default is port 18000; the shell or console-local `.env.local` can override it. Production hosting must provide the same-origin reverse proxy.

```sh
npm test
npm run build
npx playwright install chromium --no-shell
npm run test:browser
```

The browser suite checks the sample report at projector resolution, separate cohort selection, the permanent limitations panel, the persistent seed badge, and manual snapshot digest entry with a visible 409 path. Browser binaries can be shared with the app by setting the same `PLAYWRIGHT_BROWSERS_PATH`.

## Operator flow

1. Start the engine, app on 5173, and console on 5174.
2. Click **Lock v1**. Give the displayed full digest to a mentor or judge before the first probe. Copying the digest never fills the snapshot input.
3. Enter a ProjectPage in the app after the lock. Both decision-point plans are loaded there. Choose Apply → Not now, then answer the optional question.
4. The console requests `/api/report` immediately and every three seconds. It retains the last report with a visible warning if refresh fails. Each finding uses its own question version, decision point and exposure cohort.
5. Paste the externally held digest into **Digest held outside the system**, then click **Write v2 snapshot**. A mismatch is shown as a 409 warning. Current evidence is labeled a candidate; a persisted snapshot is listed separately.

## Evidence and display guards

The nine report panels render only the report contract. Hypotheses always include an Other row. Every v1 self-report remains Unresolved. Current self-reports with fewer than three respondents also remain neutral and Unresolved, while their observation and conflict flag remain visible.

The UI uses the engine's exact `finding.text` only when it matches the numeric numerator/denominator and the `k of n respondents` format. Invalid count wording is withheld and flagged. Wording outside the permitted report vocabulary is withheld rather than silently rewritten into a new claim. Source references render as text, not executable HTML. Findings and decisions expose their supplied evidence IDs.

For funnel counts the denominator is all current recorded sessions. Cohort coverage and exits use that cohort's recorded sessions. Probe counts use sessions with a recorded exposure to that plan; `shown` is displayed against that same population. These denominators do not estimate eligibility reach. No role endpoint or role payload is used.

## API fields not available

- Eligible population counts per decision point, including consent/eligibility exclusions. The console reports recorded exposure populations and explicitly labels the missing reach denominator.
- A v1 funnel and v1 probe counts. The console compares hypotheses and observation evidence against v1 and shows the current funnel/coverage without inventing a baseline series.
- Raw event/response detail or a lookup URL for an evidence ID. Supplied IDs and source file/line/quote are displayed, but there is no fabricated drill-through endpoint.
- A full historical policy trace with timestamps/tier. `current.decisions` is rendered in API order, with the provided action, result, rules and data version.

No engine changes are needed to render the existing sample response. These are optional contract additions for richer comparisons and provenance, not values calculated by this frontend.

## Real API integration check

Start an isolated API instance with `GHOST_MODE=pilot` and a separate database, then run:

```sh
GHOST_LIVE=1 GHOST_API_TARGET=http://127.0.0.1:18001 npm run test:browser
```

This opt-in check refuses a non-pilot API run. It opens the real app and console on 5183/5184, locks v1 if needed, drops the exposure beacon intentionally, answers the question, and checks that the API infers the exposure and that the console updates within three seconds. It writes a synthetic session and response to that pilot database.
