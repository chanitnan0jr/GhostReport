# Project documentation handoff

Date: 2026-10-15 · Branch: main · Risk: Low · Authorization: requested documentation work

## Goal

Explain GhostReport in Thai: the problem, intended users, research foundations, local setup, API keys, collection timing and the web Report. Describe the current prototype separately from planned product flows.

## Files

- `README.md`: repository entry point, audience-facing summary and links to the guide.
- `docs/PROJECT_GUIDE.th.md`: full project guide, research citations, two setup paths, timing, integration levels and troubleshooting.
- This handoff: verification and scope record for the documentation commit.

No application, engine, roles, fixtures, prompts, tests, scripts or deploy source was changed.

## Evidence and decisions

- Read the current System Design and Core Paper Review alongside engine CLI/API/config/LLM/policy/report/seed code, the roles service and frontend documentation.
- Checked primary publication pages or full papers for all six cited works. The guide distinguishes abstract-based support from full-text interpretation and identifies the team's applications as design decisions.
- Documented that prepared demos do not need a fresh LLM call, while new analysis requires a server-side key and human review before lock.
- Documented collection-window semantics: time starts at lock, the earlier deadline wins, Report refreshes during collection, and snapshot persistence remains manual.
- Did not invent a setup script, published SDK, automatic repo checkout, editable timing UI, scheduled final report or complete read-only replay mode.
- Kept roles seed in a service-specific ignored env file in the example; actual credentials were not read or written.

## Verification

| Check                                    | Result                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| Internal file links and explicit anchors | 40 validated                                                 |
| Bash examples                            | 13 syntax-checked with `bash -n`; commands were not executed |
| Markdown formatting                      | Prettier applied                                             |
| CLI flags and environment names          | Checked against current source and local `uv run --help`     |
| Research links                           | Primary sources opened and checked                           |
| Implementation tests/build               | Not run: documentation-only work                             |
| LLM calls / installs / deployment        | Not performed                                                |

Remaining limits: these are source-grounded operating instructions, not a fresh installation or public deployment certification. Provider model availability, expired prepared plans and deployment routing still depend on the operator's environment. Code and papers may evolve after this dated snapshot.

## Skills and skip log

- Applied `code-documenter` for user-first organization, grounded command examples, diagrams and links.
- Applied `agentic-workflow` closure/commit conventions already in use for this repository session: scoped changes, verification, no credentials and no push.
- Skipped implementation tests, dependency scans and deployment checks because no runtime code or dependencies changed.
- No delegation, external messages or remote publication was performed.

## Version control and recovery

These files belong to one documentation commit with a Conventional Commit message. The maintainer can find its hash with `git log -1 -- README.md docs/PROJECT_GUIDE.th.md`.

No push was performed. Rollback is a revert of that documentation commit; it has no database or runtime effect. Owner: project maintainer. Rollback was not executed.

## Next step

Read [the Thai guide](../PROJECT_GUIDE.th.md), select prepared demo or new investigation, supply local secrets and follow the corresponding commands. Update the dated capability table when setup/deployment automation changes.
