# NemlleA Document Processing Engine

A standalone, API-first document processing backend for PDF, DOCX, TXT, Markdown and JSON. It is intentionally UI-free: websites, mobile apps and other backends integrate through the REST API and webhooks.

## What it does

- Uploads and safely stores documents with size/type validation.
- Runs asynchronous jobs with persistent status, progress, timestamps and structured errors.
- Extracts text from PDF/DOCX/TXT/Markdown/JSON.
- Analyzes document statistics and metadata.
- Validates document integrity.
- Performs deterministic text normalization/correction (Unicode normalization, line endings, repeated whitespace, punctuation spacing).
- Converts text-oriented documents between TXT, Markdown, JSON, DOCX and PDF. PDF/DOCX conversion intentionally produces a clean text-based document rather than trying to preserve arbitrary source layout.
- Delivers completion/failure/timeout events through signed webhooks.
- Enforces upload/output/time/retention/concurrency limits from environment configuration.
- Deletes temporary data automatically and supports retention-based cleanup of stored source/result files.
- Exposes readiness/liveness health checks, format capability discovery and versioned API endpoints.

## Quick start

### Local

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the generated OpenAPI UI. The Engine itself remains backend-only.

### Docker

```bash
docker build -t nemllea-document-engine .
docker run --rm -p 8000:8000 --env-file .env \
  -v "$(pwd)/storage-data:/app/storage-data" \
  nemllea-document-engine
```

Or use the included compose file:

```bash
docker compose -f deploy/docker-compose.yml up --build
```

## API flow

1. `POST /api/v1/files` uploads a document and returns `file_id`.
2. `POST /api/v1/jobs` creates an asynchronous job referencing that `file_id`.
3. `GET /api/v1/jobs/{job_id}` polls status/progress.
4. `GET /api/v1/jobs/{job_id}/result` returns result metadata.
5. `GET /api/v1/jobs/{job_id}/download` downloads the produced artifact.
6. `GET /api/v1/jobs/{job_id}/events` returns the event history.

Authentication may be omitted for local development. In production, `ENGINE_API_KEY` is mandatory and must be at least 32 characters. Clients can send `X-API-Key: <key>` (or `Authorization: Bearer <key>`).

## Architecture

```text
HTTP client
   |
   v
/api/v1
   |
   v
Core services ---- configuration
   |                 |
   +---- storage ----+---- adapters (PDF/DOCX/TXT/MD/JSON)
   |
   +---- job repository (SQLite)
   |
   +---- worker manager -> isolated Python worker process per job
   |
   +---- webhook/event dispatcher
```

The core never depends on a web framework-specific document implementation. New formats and storage backends can be registered through adapter interfaces.

## Project structure

```text
engine/
├── core/       domain models, repositories, processors, services
├── api/        versioned FastAPI routes and middleware
├── adapters/   format + storage extension points
├── config/     environment-backed settings
├── workers/    async queue + isolated worker runner
├── storage/    local runtime data (created automatically)
├── examples/   integration examples
├── docs/       installation, API, security and extension guides
├── tests/      automated tests
├── deploy/     Docker Compose + systemd example
└── scripts/    developer/maintenance helpers
```

## Supported formats

| Format | Read | Write | Notes |
|---|---:|---:|---|
| TXT | yes | yes | UTF-8 text |
| Markdown | yes | yes | text-preserving conversion |
| JSON | yes | yes | string, object with `text`, or `{\"text\": [...]}` input |
| DOCX | yes | yes | text extraction / generation |
| PDF | yes | yes | text extraction / text-only generation |

The conversion layer is deliberately content-first. It does not claim full visual/layout fidelity for arbitrary PDFs/DOCX files.

## Minimum operational profile

For small jobs (single-user development): 1 vCPU, 512 MB RAM, 1 GB free storage.

For a modest API deployment: 2 vCPU, 2 GB RAM, 10+ GB persistent storage. Increase storage according to upload volume and retention period. PDF/DOCX conversions can temporarily require several times the input file size.

## Production notes

- Use persistent storage for `ENGINE_STORAGE_ROOT`.
- Set a non-empty `ENGINE_API_KEY`.
- Set restrictive `ENGINE_CORS_ORIGINS` if a browser frontend will call the API directly.
- Place the API behind TLS/reverse proxy and rate limiting.
- Use object storage or a shared storage adapter before running multiple independent API replicas.
- Run the worker in the same deployment unit or as a separately scaled worker service.

See `/docs` for the complete integration, hosting, security and extension contract.
