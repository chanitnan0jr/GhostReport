# English README and deployment documentation

## Request

Rewrite the project README in English, taking structural cues from established
open-source projects. Keep setup instructions aligned with the implementation
and the working Railway deployment.

## Changes

- Replaced the short Thai README with an English product overview, Docker
  quickstart, operator/API-key setup, architecture diagram, research context,
  ENS case study, development commands, collection windows, and documentation
  links.
- Distinguished DAO visitor events, browser-driven seed sessions, external ENS
  code analysis, and isolated ENS synthetic feedback. Kept broader platform
  integrations in the roadmap.
- Documented all three Railway Dockerfiles, separate persistent volumes, and
  the single-origin gateway. Updated the gateway guide to use explicit dashboard
  settings for new services, with a note about deprecated Config as Code.
- No engine, frontend, fixtures, runtime configuration, or credentials changed.

## Sources

README organization was informed by these official project READMEs; product
claims and commands were checked against this repository:

- [vLLM README](https://github.com/vllm-project/vllm/blob/main/README.md)
- [Microsoft MarkItDown README](https://github.com/microsoft/markitdown/blob/main/README.md)
- [Microsoft AutoGen README](https://github.com/microsoft/autogen/blob/main/README.md)
- [Railway Config as Code documentation](https://docs.railway.com/config-as-code)
- [Railway start-command documentation](https://docs.railway.com/deployments/start-command)

## Validation

- Prettier formatted both changed READMEs.
- Checked 38 local links, including the logo and section anchors; all resolve.
- Checked that both READMEs contain English text and balanced, labelled code
  fences.
- `git diff --check` passed.
- Setup commands were reviewed against source and configuration. No application
  tests, builds, seed runs, or deployments were run for this documentation change.

Changes are committed locally by scope. Nothing was pushed.
