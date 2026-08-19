# uv ships its own Python, so there is no separate interpreter to install and
# no pip in the image.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Dependencies first, as their own layer: application code changes on every
# commit, the lockfile rarely, so this install is reused across builds.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY app ./app
RUN uv sync --locked --no-dev

ENV PATH="/app/.venv/bin:$PATH"

# Not root: a container that only serves HTTP has no reason to be able to write
# to its own filesystem as root.
RUN useradd --create-home --uid 10001 api && chown -R api:api /app
USER api

EXPOSE 8000

# The platform supplies PORT; 8000 is the local default.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
