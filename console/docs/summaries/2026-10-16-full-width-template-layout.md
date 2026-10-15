# Full-width template layout

- Move the Generated journeys disclosure below the page introduction. Open its
  content directly beneath the button and above the population toolbar.
- Keep Template / original cohorts on its own full-width row at all times;
  remove the side-by-side comparison grid. Hidden content stays unmounted.
- Preserve source filtering, selection, approval permissions and all API data.
- Validation: console production build and whitespace checks pass. Browser review
  at 1280px gives template width 1224px before and after opening; at 1440px it
  stays 1384px. Generated content sits above the flow with no horizontal overflow.
- No test suites added/run. Low risk layout change using existing UI-UX-Design
  hierarchy/spacing guidance and agentic-workflow scope/commit rules.
- Scope: three console presentation files. Rebuild local Docker with matching
  GIT_SHA. No remote push. Recovery: revert this commit and rebuild.
