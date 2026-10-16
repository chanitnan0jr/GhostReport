# Railway gateway preparation

## Summary

The user has configured `api` and `roles` and requested the next deployment
step. Added a separate Railway gateway, preserving the existing local Compose
configuration and application code.

Files: `deploy/gateway/{Dockerfile,Caddyfile,railway.json,README.md}` and this
summary. Planned and actual scope match; unrelated work is preserved.

- `/roles/*` proxies to roles with the URI prefix intact; everything else
  proxies to the API and its built frontends.
- Listening port and upstreams have environment overrides, with defaults for
  `api:8000` and `roles:8100` on Railway's private network.
- Railway handles HTTPS; Caddy's admin endpoint, automatic HTTPS and config
  persistence are disabled. The gateway needs no application credentials or
  persistent volume.
- Pinned the existing Caddy 2.10.0 image to its locally inspected registry digest
  `sha256:ae4458638da8e1a91aafffb231c5f8778e964bca650c8a8cb23a7e8ac557aa3c`.

## Verification and limits

- Local Docker image build passed.
- Caddy configuration validation in that image, with networking disabled,
  passed. Railway JSON parses and its referenced Dockerfile exists.
- Reviewed new files for credentials; no credential values were introduced.
- No tests added or run: this turn did not request tests. No production deploy,
  push, remote configuration change or database write was performed.
- Railway networking and the public domain still need verification after the
  user deploys. The gateway health check covers the API; roles health must be
  checked separately.

## Risk and recovery

Risk: Medium for future public routing; current changes only prepare local
artifacts. User authorized gateway preparation by continuing the setup. Rollback
owner: project maintainer. After deployment, use the previous working gateway
revision or correct upstream settings before publishing the first domain.
Volumes are unaffected; rollback has not been rehearsed.

## Workflow

Applied `agentic-workflow` and `devops-engineer`. References: safety gate,
execution/scope audit, self-review, Docker patterns, and saved summary template.
Rules applied: explicit staging, pinned image, no secrets, no push. Skipped
production rollout and live smoke checks because deployment remains with the
user. No general application checks were run for this isolated proxy addition.

Branch: `main`. Local gateway commit is created with this report; nothing is
pushed. Next: push the reviewed commit, create `gateway` using
`/deploy/gateway/railway.json`, and generate its public domain on port `8080`.
