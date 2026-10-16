# Railway gateway

One public origin for the existing `api` and `roles` services. The API service
already serves landing, app and console static files.

## Create the service

1. Push the reviewed gateway commit to the GitHub branch Railway deploys.
2. Add a service from the same GitHub repository and name it `gateway`.
3. Keep **Root Directory** at `/`. In the dashboard, set **Builder** to
   **Dockerfile** and **Dockerfile Path** to `/deploy/gateway/Dockerfile`.
   Set **Start Command** explicitly to
   `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.
   This also makes a mistakenly selected API image fail to start visibly.
   Set **Healthcheck Path** to `/api/health`, timeout to 120 seconds, and
   replicas to 1. Disable application sleeping and use an **On Failure**
   restart policy with 5 retries.
4. Set the gateway variables using references to the actual upstream services:

   ```dotenv
   PORT=8080
   RAILWAY_DOCKERFILE_PATH=deploy/gateway/Dockerfile
   API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
   ROLES_UPSTREAM=${{roles.RAILWAY_PRIVATE_DOMAIN}}:${{roles.PORT}}
   ```

   These references assume services named `api` and `roles`, with explicit `PORT`
   variables. If a service has a different name, such as `service roles`, select
   that service in Railway's variable-reference picker for both its private
   domain and port. Keep each upstream in `hostname:port` form.

   Read `RAILWAY_PRIVATE_DOMAIN` from the upstream service rather than guessing
   its hostname from the display name. The Caddyfile's fallback hostnames are
   examples that only work when those domains actually exist. API/roles must
   be running in the same Railway project and environment as the gateway.

5. Apply the staged changes and deploy. The health check requests `/api/health`
   through the API upstream. The new deployment must build the Caddy image from
   `deploy/gateway/Dockerfile`; Python/Uvicorn startup logs belong to the API.
6. In **Settings → Networking → Generate Domain**, use target port `8080`.
   Share this gateway domain with visitors.

The gateway needs no persistent volume or application credentials. The existing
API and roles services keep their separate `/data` volumes. Do not mount either
database into the gateway.

### Legacy configuration files

[Railway has deprecated Config as Code](https://docs.railway.com/config-as-code).
New services cannot opt in; existing services can use it until December 1, 2026.
For a new service, use the dashboard settings above. The checked-in
`deploy/gateway/railway.json` remains a reference for legacy services. This
repository does not yet provide Railway's replacement Infrastructure as Code.

On a legacy service already using Config as Code, the config file is
`/deploy/gateway/railway.json`; file settings override dashboard settings.

## Existing services: select each service's configuration

There is deliberately no `railway.json` at the repository root. The former
root file selected the API Dockerfile; automatic discovery could apply those
API settings to another service from the same repository. The API's legacy
configuration now lives at `deploy/api/railway.json`.

For legacy services that use configuration files, select these exact paths:

| Service   | Railway Config File            | Dockerfile Path              | Healthcheck Path |
| --------- | ------------------------------ | ---------------------------- | ---------------- |
| `api`     | `/deploy/api/railway.json`     | `/Dockerfile`                | `/api/health`    |
| `roles`   | `/roles/railway.json`          | `/roles/Dockerfile`          | `/roles/health`  |
| `gateway` | `/deploy/gateway/railway.json` | `/deploy/gateway/Dockerfile` | `/api/health`    |

All three retain **Root Directory** `/`. For new services, set Dockerfile and
health checks in the dashboard instead of opting into deprecated Config as Code.
Keep API/roles volume mounts and their variables on their existing services.

When updating a legacy API service, change an explicit `/railway.json` reference
to `/deploy/api/railway.json` for the deployment containing this move. Use a new
deployment of the updated commit: restarting or redeploying an older commit still
uses that commit's old files. Confirm the config source in Deployment Details,
where Railway records the settings actually used by that deployment.

### Detect a gateway running the API image

The gateway build must use `caddy:2.10.0-alpine` and copy the Caddyfile. Node,
Python, `COPY engine`, or frontend build stages identify the API image.
Inside a gateway SSH session, `caddy version` must succeed. Runtime logs must
show Caddy starting. A response from `/api/health` alone does not distinguish a
working proxy from an accidentally deployed engine.

If visitors created sandboxes on an accidental gateway engine, those records
belong to that instance. Correct routing does not transfer them into the real
API database; start a new sandbox after the gateway is repaired. Preserve the
real API and roles volumes throughout recovery.

## Routes

| Public path                                                   | Upstream                               |
| ------------------------------------------------------------- | -------------------------------------- |
| `/roles/*`                                                    | roles service, with the path preserved |
| `/api/*`                                                      | API service                            |
| `/`, `/app/`, `/report/`, `/ens/`, `/install/`, static assets | API service                            |

The browser keeps calling relative URLs. No frontend roles URL or cross-origin
configuration is required for this route. Railway terminates public HTTPS;
Caddy uses HTTP to services on the private network. Operator authorization
continues to be enforced by the engine.

## After deployment

Open the gateway's `/api/health` and `/roles/health`, then the Home, DAO Mock and
Report pages. A passing gateway health check covers the API upstream; verify
roles health separately. A `502` usually needs a check of the upstream's private
domain, listening port and service health.

### DNS lookup failures

`lookup api.railway.internal ... no such host` means the configured API hostname
could not be resolved from the gateway. Check the corresponding upstream
reference, service status, private networking, and project/environment first.
The same applies to the roles hostname. This error occurs before connecting to
the upstream port or checking any LLM credentials.

If setting upstreams manually, run the following inside each upstream service's
SSH session and use the result for the matching gateway variable:

```sh
printf '%s:%s\n' "$RAILWAY_PRIVATE_DOMAIN" "$PORT"
```

Confirm `PORT` is set and matches the listening port; the roles image otherwise
defaults to `8100` and the API image to `8000`. Apply the gateway variable changes
and deploy. From a running Caddy gateway, this read-only request checks API
connectivity without calling an LLM:

```sh
wget -S -O /dev/null -T 5 "http://${API_UPSTREAM}/api/health"
```

Local image build and configuration validation:

```bash
docker build -f deploy/gateway/Dockerfile -t ghostreport-railway-gateway:local .
docker run --rm --network none ghostreport-railway-gateway:local \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Recovery

If an update fails, the project maintainer can roll the gateway back to its
previous working Railway deployment. For an initial deployment, correct the
upstream variables/config and redeploy before sharing the domain. Gateway
updates do not require database resets or changes to API/roles volumes.

## References

- [Railway reverse proxy guidance](https://docs.railway.com/guides/spa-routing-configuration)
- [Railway private networking](https://docs.railway.com/networking/private-networking)
- [Railway monorepo configuration](https://docs.railway.com/deployments/monorepo)
- [Railway start commands](https://docs.railway.com/deployments/start-command)
- [Railway Dockerfile selection](https://docs.railway.com/builds/dockerfiles)
- [Railway variable references and private domains](https://docs.railway.com/variables/reference)
