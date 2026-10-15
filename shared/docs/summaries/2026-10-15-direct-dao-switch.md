# Direct DAO switch destination

- DAO Mock now links to `/app/`, bypassing the retired role-card entry.
- Existing active-state logic still selects DAO Mock on `/app/` and legacy
  `/try/`; the shared ghost logo and report links remain unchanged.
- All three frontend builds passed; localhost shows the active DAO pill on
  the app's initial consent screen. Updated local frontend bundles.
- No dependencies, tests, backend or unrelated source changes. Low risk.
- Used agentic-workflow module scope and local-only commits; no push. Recovery:
  revert the shared navigation change and rebuild consumers; not rehearsed.
