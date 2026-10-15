# Home sticky header

## Change

- Keep the Home header at the top with `position: sticky`, `top: 0` and
  the same stacking level as the console header. Scope the rule to Home.
- Preserve normal document flow so the hero retains its space below the header.
- Only implementation file: `landing/src/site.css`. Concurrent shared header
  and frontend edits are excluded from this commit.

## Verification

- Landing TypeScript/Vite production build passed; diff whitespace check passed.
- Local Docker landing static files refreshed; API container healthy.
- Browser review at 1448px: header spans 1448px; header top remains 0 before
  and after scrolling the Home page to its bottom (scrollY 571).
- No test suites run or dependencies changed.

## Scope and recovery

- Low risk CSS change; existing user authorization covers the local refresh.
- Applied UI-UX-Design layout guidance and agentic-workflow scope/commit rules.
- No clarification required; backend, shared header and other pages unchanged.
- Recovery: revert this commit, rebuild landing and refresh local static files.
  Rollback not rehearsed; no remote deployment or push.
