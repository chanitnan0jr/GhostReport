# Feedback before the first Connect click

- Optional exit feedback now excludes every session with a recorded Connect
  attempt, regardless of which cohort the server plan targets.
- Clicking Connect dismisses a currently open question. Reject, error and reload
  do not restore eligibility; the existing tracker persists the attempt state.
- The app records its active session ID in `ghost:judge_sid` for the report
  highlight now that public entry bypasses role assignment.
- Existing consent, plan deadline, cohort and exit checks remain required.

Validation: all three frontend builds passed. Reviewed localhost in a browser
with intercepted API requests: legacy entry preserves sid/query, consent screen
appears directly, zero role requests, Not now shows feedback before Connect,
Connect closes it, Reject does not show it again, and reload with an
attempted-no-success plan still shows no question. No review data reached the
engine. No test suites run or added.

Scope: app source and documentation only; frontend eligibility changed without
editing the engine or its locked investigation. App instrumentation verification
and pinned source references need a new backend-owned verification/review on the
final commit before evaluation. Low-risk local UI change; no push. Recovery is a
module revert followed by an app rebuild; rollback not rehearsed.
