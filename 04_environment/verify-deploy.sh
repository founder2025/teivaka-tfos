#!/usr/bin/env bash
# verify-deploy.sh — B78 guard.
#
# Fails LOUDLY if the running api container's Python code differs from the host
# repo. Catches the cached-COPY trap (B78) where a plain `up -d --build api`
# serves a stale CACHED layer and silently ships old code — which cost a real
# debugging session on 2026-06-08 (crop-WHD endpoint deploy).
#
# Usage:
#   bash 04_environment/verify-deploy.sh                 # defaults: teivaka_api + /opt/teivaka
#   bash 04_environment/verify-deploy.sh <container> <host_app_dir>
#
# Exit 0 = container code == host code. Exit 1 = drift (rebuild with --no-cache).
set -euo pipefail

CONTAINER="${1:-teivaka_api}"
HOST_APP="${2:-/opt/teivaka/11_application_code/app}"

if [ ! -d "$HOST_APP" ]; then
  echo "❌ host app dir not found: $HOST_APP" >&2
  exit 2
fi

# Order-stable fingerprint of (relpath, content-sha256) over *.py only.
host_fp="$(find "$HOST_APP" -type f -name '*.py' -exec sha256sum {} \; \
  | sed "s#${HOST_APP}/##" | sort | sha256sum | cut -d' ' -f1)"

cont_fp="$(docker exec "$CONTAINER" sh -c \
  'find /app/app -type f -name "*.py" -exec sha256sum {} \; | sed "s#/app/app/##" | sort | sha256sum | cut -d" " -f1')"

if [ "$host_fp" != "$cont_fp" ]; then
  echo "❌ DEPLOY DRIFT (B78): ${CONTAINER} code does NOT match host (${HOST_APP})."
  echo "   host=${host_fp}"
  echo "   cont=${cont_fp}"
  echo "   The image is serving STALE code (a cached COPY layer). Rebuild clean:"
  echo "     docker compose -f 04_environment/docker-compose.yml build --no-cache api"
  echo "     docker compose -f 04_environment/docker-compose.yml up -d api"
  exit 1
fi

echo "✅ Deploy verified: ${CONTAINER} matches host (${host_fp})"
