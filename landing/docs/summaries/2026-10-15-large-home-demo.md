# Full-size Home demo and DAO artwork

Date: 2026-10-15 · Branch: main · Risk: Low · Approval: user requested.

## Summary

- Home reuses the existing full-size DemoClips player: four portrait videos,
  Play all four, visible timed logs, and segment results. Removed the compact
  duplicate player. Video height is up to 460px, previously about 155px.
- Not now + answer and attempted without success map to Stopped at the wallet;
  no-gate maps to Browsers. No rejection tracking event is invented.
- Fixed the playback clock fallback so a video at zero does not borrow another
  video's time, and playback rejection no longer leaves an unhandled promise.
- Common Ground DAO uses the user's final white-background artwork, copied
  unchanged from `/home/Sinu/Downloads/images.jpg` to
  `public/images/common-ground-dao.jpg`. The earlier cyan artwork was discarded.
- No backend, console, app, deploy configuration or database edits.

## Verification and local runtime

- Landing TypeScript/Vite production build passed; git diff --check passed.
- Local Docker image updated with only landing/dist over the existing runtime
  image, then api/proxy brought up without a full backend or console rebuild.
  The repository Dockerfile still rebuilds these landing sources normally.
- Browser plugin unavailable; used local Playwright/Brave at localhost, 1280px.
- Four videos rendered at 460px tall; Play all four advanced all four clocks.
  Event logs appeared at recorded times. No page errors observed.
- Viewed the rendered demo screenshot; no unit/E2E suites run.
- White DAO image loaded and was inspected after the final replacement.

## Scope, skills and limitations

Changed landing HomeDemo, HomePage, DemoClips, site.css, README, artwork and this
report. Console work remains paused and excluded from the commit.
Used existing agentic-workflow and frontend debugging guidance: small scoped
edits, visual review, explicit staging, local commit and no push.
No new concept or image generation: user supplied the exact layout and artwork.
No dependency changes or dependency audit; mobile and remote deployment not run.
No tracking/probe/role behavior changes. Seed recordings remain static.

## Recovery

Revert this landing commit and rebuild landing if needed. Runtime uses the
existing persistent Docker volumes; no reset or reseeding was performed.
Repository maintainer owns rollback; it was not rehearsed. No push performed.
