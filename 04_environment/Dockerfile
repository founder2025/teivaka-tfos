# FILE: 04_environment/Dockerfile
#
# Teivaka Agricultural TOS — Multi-Stage Dockerfile
# Target platform: linux/arm64 (Hetzner CAX21 ARM64 VPS)
# Python version: 3.12
# Final image user: teivaka (non-root, UID 1000)
#
# Build stages:
#   1. builder  — installs build dependencies and compiles Python packages
#   2. runtime  — minimal runtime image, copies compiled packages only
#
# Build:
#   docker build --target runtime -t teivaka-api:latest .
#
# Run:
#   docker run --rm -p 8000:8000 --env-file .env teivaka-api:latest
#
# Notes:
#   - ARM64 compatible (python:3.12-slim ships multi-arch including arm64)
#   - psycopg2 replaced by asyncpg (no C extension needed for asyncpg)
#   - pycurl NOT used (avoids libcurl dependency complexity)
#   - curl installed in runtime for HEALTHCHECK only

# ==============================================================================
# STAGE 1: BUILDER
# Full build environment — install all build tools, compile packages
# This stage is not included in the final image
# ==============================================================================

FROM python:3.12-slim AS builder

# Build metadata labels
LABEL stage="builder"
LABEL maintainer="Teivaka Development Team"
LABEL description="Teivaka Agri-TOS API builder stage"

# Set build environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100

# Install system build dependencies
# These are needed to compile Python packages with C extensions:
#   gcc, g++       — C/C++ compilers
#   libpq-dev      — PostgreSQL client library (for psycopg2 if used)
#   build-essential — Make, headers
#   python3-dev    — Python development headers
# Also install curl for package downloads during build
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    libpq-dev \
    python3-dev \
    libffi-dev \
    libssl-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create and activate virtual environment
# Using venv isolates packages from system Python
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and wheel in the virtual environment
RUN pip install --upgrade pip wheel setuptools

# Copy requirements file first (Docker cache layer optimization)
# If requirements.txt doesn't change, this layer is reused
COPY requirements-api.txt /tmp/requirements-api.txt

# Install all Python dependencies into the virtual environment
# Production image installs ONLY runtime deps. Test/dev/migration extras
# live in requirements-dev.txt and are never shipped.
RUN pip install --no-cache-dir -r /tmp/requirements-api.txt

# ==============================================================================
# STAGE 2: RUNTIME
# Minimal production image — only runtime dependencies, no build tools
# ARM64 compatible — python:3.12-slim supports linux/arm64
# ==============================================================================

FROM python:3.12-slim AS runtime

# Image metadata
LABEL maintainer="Teivaka Development Team"
LABEL description="Teivaka Agri-TOS API — Production Runtime"
LABEL version="1.0"
LABEL org.opencontainers.image.title="teivaka-api"
LABEL org.opencontainers.image.description="Teivaka Agricultural TOS API Server"

# Runtime environment variables
# PYTHONDONTWRITEBYTECODE: don't write .pyc files (saves disk space)
# PYTHONUNBUFFERED: stdout/stderr are not buffered (logs appear immediately)
# PYTHONFAULTHANDLER: enables Python fault handler (better crash traces)
# PATH: prepend virtual environment bin to PATH
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app"

# Install ONLY runtime system dependencies
# libpq5     — PostgreSQL client library runtime (for asyncpg connection)
# curl       — Required for HEALTHCHECK CMD (curl -f http://localhost:8000/...)
# ca-certificates — TLS certificate verification (required for Anthropic, OpenAI, Twilio APIs)
# tzdata     — Timezone data (required for Pacific/Fiji timezone support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set timezone to Pacific/Fiji for system-level timezone operations
# Application also uses this timezone for date calculations
ENV TZ=Pacific/Fiji
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create non-root user 'teivaka' for security
# Running as root inside a container is a security risk
# UID/GID 1000 is conventional for the first non-root user
# --no-create-home: no home directory needed for service account
# --shell /bin/false: no interactive shell (service account only)
RUN groupadd --gid 1000 teivaka && \
    useradd --uid 1000 --gid teivaka \
            --no-create-home \
            --shell /bin/false \
            teivaka

# Set working directory
WORKDIR /app

# Create application directories with correct ownership
# /app/logs  — application log files (mounted as volume in docker-compose)
# /app/data  — persistent data (e.g., celerybeat-schedule)
# /app/tmp   — temporary files (audio processing, etc.)
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R teivaka:teivaka /app

# Copy virtual environment from builder stage
# This copies all compiled packages without the build toolchain
COPY --from=builder --chown=teivaka:teivaka /opt/venv /opt/venv

# Copy application source code
# Build context = 11_application_code/ — all paths are relative to that directory
# Note: In development, this COPY is overridden by volume mounts in docker-compose
COPY --chown=teivaka:teivaka app /app/app
COPY --chown=teivaka:teivaka alembic.ini /app/alembic.ini
COPY --chown=teivaka:teivaka alembic /app/alembic

# Switch to non-root user
# All subsequent commands (CMD, ENTRYPOINT, HEALTHCHECK) run as this user
USER teivaka

# Expose application port
# FastAPI/uvicorn listens on 8000
# Caddy proxies from 443 to this port (host network or Docker network)
EXPOSE 8000

# Health check
# Calls the /api/v1/health endpoint every 30 seconds
# Health endpoint should return HTTP 200 with {"status": "healthy"}
# --fail: return non-zero exit code on HTTP error (>= 400)
# Interval, timeout, retries configured in docker-compose.yml
# This CMD is the fallback — docker-compose overrides for more control
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Default command: start uvicorn
# Entry point: app/main.py → app.main:app  (PYTHONPATH=/app, so app.main resolves to /app/app/main.py)
# --workers 4 — matches CAX21's 4 vCPUs; workers run alongside the API on the same host
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--timeout-keep-alive", "30", \
     "--access-log"]
