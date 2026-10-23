# syntax=docker/dockerfile:1
FROM python:3.12-slim

# uv from Astral: https://docs.astral.sh/uv/
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_PYTHON_DOWNLOADS=never
ENV PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install the shmarql package itself and its runtime dependencies from the lockfile.
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Markdown documentation served at / (see the DOCS_PATH setting).
COPY docs ./docs

# Bind on all interfaces inside the container; override with `docker run -e`.
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Same as `uv run shmarql serve`: run the FastAPI app via uvicorn.
CMD ["shmarql", "serve"]
