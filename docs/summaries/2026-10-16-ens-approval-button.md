# ENS approval button

## Summary and authorization

The owner clarified that the missing item was the actual Approve button.
This updates the earlier offline-only approval decision: an authenticated
operator may approve the prepared ENS draft on the website. Generation remains
offline and public visitors remain read-only. The draft was not approved on the
owner's behalf.

## Changes and scope

- Engine: authenticate ENS approval, validate the displayed digest and refs,
  require a reviewer, and save one immutable approval in the persistent database
  directory. A committed fixture takes precedence. Existing report and locked
  v1 stay unchanged. Covered by persistence/authentication checks.
- Console: add a public review link, put the operator approval form above the
  graph, send `project=ens`, show saved metadata, and offer fixture download.
  Add an ENS journeys link from its code-only Report page.
- Shared navigation: preserve explicit operator mode across ENS report tabs.
- Update review instructions. No unrelated files or owner handoff were staged.

Planned and actual scope: `engine/journey_api.py`,
`tests/test_segment_spec.py`, `shared/navigation.ts`,
`console/src/{App,GeneratedJourneys,GeneratedJourneys.test,ProjectSelection.test}.tsx`,
`console/src/journeySpecs.ts`, review documentation and this summary.

## Verification

- Backend: 105 tests passed; strict mypy passed for 30 modules; changed-file Ruff
  passed. Previously documented global E501 warnings are outside this change.
- Console: 40 tests passed; app: 39; landing: 15. Type checks passed. Console and
  shared navigation formatting passed; projector Playwright: four passed.
- Docker: all three frontend builds and the instrumentation verification passed,
  with existing volumes preserved.
- Real localhost browser: followed review link, unlocked the form with a
  non-valid preview token, verified reviewer is required, and verified the
  Approve button is visible/enabled after entering a reviewer. No approval was
  submitted and no POST requests occurred. Navigation preserves operator mode;
  no page errors. The server still reports `approved: null`.
- Screenshot: `/tmp/ghostreport-ens-approve-button-localhost.png`.
- An initial browser check expected another token prompt after changing tabs;
  the existing in-memory token correctly remained unlocked. The corrected check
  verified that behaviour and passed.

## Risk, assumptions and recovery

- Risk: Medium, because the operator can persist an approval; the bearer token,
  digest/ref validation and no-overwrite checks protect the operation.
- Only a user submitting the form records approval. Unlocking the UI is not
  authentication; server requests validate the token.
- Local approval persists in the mounted database directory. Download and commit
  `fixtures/partb/journeys.ens.json` to carry it to another deployment.
- No dependency changes or scans. No production deployment or push. No LLM call.
- Recovery: revert the module commits and rebuild locally. No database migration
  or volume deletion is required. Maintainer owns recovery; not rehearsed.

## Version control and workflow

On `main`, separate local module commits:

- `3983096` — authenticated engine approval and persistence.
- `29c4478` — operator navigation across ENS tabs.
- `e89c93d` — console approval form and fixture download.

This report is committed separately. Skill applied: `agentic-workflow` scope,
verification, explicit staging, Conventional Commits and saved report rules.
References: skill instructions, commit convention and summary template.
Skipped production deployment procedures; this task updates localhost only.
Unrelated untracked files are preserved.

## Next step

Open `/report/?project=ens&operator=1#segments`, enter the configured operator
token, enter the reviewer's name and select **Approve reviewed definitions**.
Download the fixture after approval if it should be committed for deployment.
