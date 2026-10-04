#!/usr/bin/env bash
set -euo pipefail
exec uvicorn api.main:app --host "${ENGINE_HOST:-0.0.0.0}" --port "${ENGINE_PORT:-8000}"
