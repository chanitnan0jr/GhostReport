# Generated journeys disclosure

## Change

- Move generated definitions behind a collapsed-by-default Generated journeys
  button at the right of the User journeys and segments heading.
- Show the original flow at full width until the comparison is opened. Opening
  preserves the template/generated comparison; closing restores full width.
- Mount the generated panel only while open, so hidden definitions do not poll.
- Keep the existing operator authorization, report, source filters and ENS view.

## Validation and scope

- Console production build and git whitespace checks passed.
- Browser review at 1440px: initial panel absent, aria-expanded=false, no spec
  requests and template width 1384px. Opening expands the comparison; closing
  removes it again, with no horizontal overflow.
- No unit or browser test suites added/run for this presentation adjustment.
- Low risk, scoped to three console component/style files. Existing UI-UX-Design
  navigation/focus guidance and agentic-workflow commit/scope rules applied.
- Rebuild localhost from this commit with GIT_SHA. No remote deployment or push.
- Recovery: revert this commit and rebuild. No stored data or schema changed.
