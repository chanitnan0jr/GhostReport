# Hero loop label color

Date: 2026-10-15 · Branch: main · Risk: Low · User requested a font-color change.
Changed only the Home loop's GhostReport label from pale blue to heading navy
(#13204a), plus this report. Navy was selected to match the existing headings.
Landing TypeScript/Vite build and diff check passed. Updated the local Docker
landing and checked the computed label color in the browser at localhost.
No unit/E2E suites, dependency audit, mobile or remote checks run for this small
CSS change. Used existing scoped-edit/frontend-debugging guidance. No tracking,
API, app, console or database changes. Revert this commit and rebuild to recover;
rollback not rehearsed. No push performed.
