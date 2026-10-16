# Railway upstream DNS diagnosis

The supplied runtime log contains 532 failures resolving `api.railway.internal`
and one failure resolving `roles.railway.internal`. This identifies DNS resolution
as the immediate failure during proxy requests, before a connection to the
upstream port or an LLM request.

Updated the gateway guide to make service references the primary setup path:
use each real upstream's `RAILWAY_PRIVATE_DOMAIN` and explicit `PORT`, selecting
the correct service namespace through Railway's variable-reference picker.
Documented DNS diagnostics, service/environment checks, and a read-only health
request from the gateway. No runtime code or credentials changed.

The log alone cannot determine whether an incorrect domain, an unavailable
upstream, or private-network configuration caused the failed DNS lookup.
Effective upstream references, upstream status, and successful public health
checks must be verified after deployment.

Validation: compared the log messages and counts, checked the official Railway
variable reference documentation, formatted Markdown, and ran `git diff --check`.
No application tests, production writes, deployment, or LLM calls were run.

Risk: low, documentation only. Recovery: revert this documentation commit if
needed. Skills: systematic-debugging, devops-engineer, and commit-convention.
Committed locally; nothing was pushed.
