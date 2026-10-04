#!/usr/bin/env bash
set -euo pipefail
BASE="http://127.0.0.1:8000/api/v1"
KEY="${ENGINE_API_KEY:-}"
AUTH=()
if [[ -n "$KEY" ]]; then AUTH=(-H "X-API-Key: $KEY"); fi

UPLOAD=$(curl -fsS "${AUTH[@]}" -F 'file=@./example.txt;type=text/plain' "$BASE/files")
FILE_ID=$(python -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<< "$UPLOAD")
JOB=$(curl -fsS "${AUTH[@]}" -H 'Content-Type: application/json' -d "{\"file_id\":\"$FILE_ID\",\"operation\":\"convert\",\"output_format\":\"pdf\"}" "$BASE/jobs")
JOB_ID=$(python -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<< "$JOB")
echo "job=$JOB_ID"
curl -fS "${AUTH[@]}" "$BASE/jobs/$JOB_ID"
