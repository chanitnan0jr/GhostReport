# Railway gateway

One public origin for the existing `api` and `roles` services. The API service
already serves landing, app and console static files.

## Create the service

1. Push the reviewed gateway commit to the GitHub branch Railway deploys.
2. Add a service from the same GitHub repository and name it `gateway`.
3. Keep **Root Directory** at `/`. In the dashboard, set **Builder** to
   **Dockerfile** and **Dockerfile Path** to `/deploy/gateway/Dockerfile`.
   Clear any custom **Start Command** so the image runs its Caddy command.
   Set **Healthcheck Path** to `/api/health`, timeout to 120 seconds, and
   replicas to 1. Disable application sleeping and use an **On Failure**
   restart policy with 5 retries.
4. Set these gateway variables, matching the existing service names and ports:

   ```dotenv
   PORT=8080
   API_UPSTREAM=api.railway.internal:8000
   ROLES_UPSTREAM=roles.railway.internal:8100
   ```

   They are also the defaults. If a service name differs, use its private domain
   and listening port. Railway reference-variable equivalents are:

   ```dotenv
   API_UPSTREAM=${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
   ROLES_UPSTREAM=${{roles.RAILWAY_PRIVATE_DOMAIN}}:${{roles.PORT}}
   ```

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
