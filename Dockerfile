# GhostReport "api" service: engine + landing/, app/, console/ on one origin.
# Railway: Dockerfile builder, volume at /data, healthcheck /api/health (railway.json).

FROM node:22.22.0-bookworm-slim AS web
WORKDIR /web
# Public URL of the roles service; baked into the landing build.
ARG VITE_ROLES_URL=
ENV VITE_ROLES_URL=$VITE_ROLES_URL
COPY app/package.json app/package-lock.json app/
COPY console/package.json console/package-lock.json console/
COPY landing/package.json landing/package-lock.json landing/
RUN npm ci --prefix app && npm ci --prefix console && npm ci --prefix landing
COPY fixtures fixtures
COPY app app
COPY console console
COPY landing landing
# The rule-event instrumentation test runs on exactly the code being deployed.
RUN cd app && (npx vitest run src/ApplyModal.test.tsx -t "fires gate exposure once per display" \
      --reporter=json --outputFile=/web/gate-test.json || true)
RUN npm run build --prefix app && npm run build --prefix console && npm run build --prefix landing

FROM python:3.13.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep git \
    && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir uv==0.11.23
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY engine engine
COPY prompts prompts
COPY fixtures fixtures
COPY ghostreport.yaml ./
COPY app/src app/src
COPY --from=web /web/app/dist static/app
COPY --from=web /web/console/dist static/console
COPY --from=web /web/landing/dist static/landing
COPY --from=web /web/gate-test.json gate-test.json
# Railway provides the deployed commit at build time; without it nothing is verified.
ARG RAILWAY_GIT_COMMIT_SHA=
ENV GHOST_COMMIT=$RAILWAY_GIT_COMMIT_SHA \
    GHOST_STATIC_DIR=/srv/static \
    GHOST_CONFIG=/srv/ghostreport.yaml \
    PATH=/srv/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1
RUN python -m engine.demo verify --app /srv/app --from-report gate-test.json \
      --out /srv/verification.json
CMD python -m engine.demo serve --run-id "${GHOST_RUN_ID:-judging}" --mode demo \
      --host 0.0.0.0 --port "${PORT:-8000}" --db-dir /data/runs --repo /srv/app \
      --investigation /srv/fixtures/investigation.app.json --verification /srv/verification.json --seed
