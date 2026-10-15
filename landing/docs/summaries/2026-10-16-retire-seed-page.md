# Retire the Seed sessions page

## Changes

- Removed the `/seed/` page from the landing route map and Vite build inputs.
- Deleted the standalone Seed page and its HTML entry.
- Removed Home links that opened the retired session list; the four recordings
  remain on Home, and session records remain in Report → Segments.
- Updated landing documentation to describe the Report Session Explorer.

## Validation

- `npm run build` in `landing/` passed; the build no longer emits `seed/index.html`.
- `npm run build` in `console/` passed for the Session Explorer readability update.
- No tests were added or run.

## Follow-up

- `scripts/seed/smoke.spec.ts` still targets `/seed/`; it belongs to the scripts
  owner and may need its path updated for the Home recordings.
