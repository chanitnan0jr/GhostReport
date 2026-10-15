# GhostReport "roles" service: a separate process with its own volume at /data.
# Build context is the repo root (Railway: dockerfilePath roles/Dockerfile).
FROM python:3.13.13-slim
RUN pip install --no-cache-dir uv==0.11.23
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY roles roles
ENV PATH=/srv/.venv/bin:$PATH PYTHONUNBUFFERED=1 ROLES_DB=/data/roles.sqlite
CMD uvicorn roles.service:app --host 0.0.0.0 --port "${PORT:-8100}"
