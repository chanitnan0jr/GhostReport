# Railway service configuration isolation

## Incident evidence

- The API container's SSH shell and its server process both contained
  `DEEPSEEK_API_KEY`; only boolean presence was inspected.
- The user confirmed that the gateway build logs contained Node, Python,
  `COPY engine`, and frontend build stages from the root API Dockerfile.
- In a gateway SSH session, `RAILWAY_SERVICE_NAME` was `gateway`, while
  `caddy version` failed because Caddy was not installed. This confirms an
  incorrect gateway image independently of dashboard settings.
- The public `/roles/health` route returned 404 during investigation.
- Gateway files at the deployed GitHub commit matched the working tree. Building
  the gateway Dockerfile locally produced Caddy with valid configuration.

## Changes

- Moved the API-specific root `railway.json` to `deploy/api/railway.json` without
  changing its settings. This removes automatic discovery of the API config for
  unrelated services using this repository.
- Made the legacy gateway config explicitly run Caddy. Selecting an API image
  with this command now fails visibly instead of starting another engine.
- Documented the service configuration paths, deployment migration, runtime
  checks, and implications for sandboxes created on an accidental gateway engine.
- Updated the API Dockerfile comment and project README. No engine, frontend,
  roles implementation, secrets, or database files changed.

The wrong gateway image is confirmed. The exact source of Railway's effective
configuration was not accessible from this workspace; root config discovery was
a concrete collision risk removed by this change, not a remotely inspected
deployment setting.

## Validation

- Built `deploy/gateway/Dockerfile` locally successfully.
- `caddy validate` passed with networking disabled.
- Inspected the built image command: it starts Caddy with the intended Caddyfile.
- Confirmed that the API image rejects the explicit Caddy entrypoint with exit
  127, the expected result because that image does not contain Caddy.
- Parsed all three service JSON configurations and checked referenced Dockerfiles.
- Checked links in the updated READMEs and ran `git diff --check`.
- Application tests and an API image rebuild were not run: API runtime code is
  unchanged. No remote deployment, LLM request, or production write was performed.

## Deployment and recovery

Risk is medium because existing API services explicitly referencing
`/railway.json` must update to `/deploy/api/railway.json` for the new deployment.
Gateway and roles keep their own existing configuration paths; new services use
explicit dashboard settings instead of deprecated Config as Code.

Keep existing API and roles volumes. Data created on an accidental gateway engine
does not automatically transfer into the API service; create a new sandbox after
correct routing is restored. Verify Caddy in gateway runtime logs, then check
both API and roles health through the public origin.

The maintainer can revert this commit and restore the former configuration path
if migration must be postponed. No production rollback was rehearsed. Local
validation does not establish that Railway has deployed the fix.

Skills applied: systematic-debugging, devops-engineer, agentic-workflow, and
commit-convention. Used evidence before changes, scoped staging, and local
commits. Production rollout and its verification remain with the maintainer.

Changes are committed locally; nothing was pushed.
