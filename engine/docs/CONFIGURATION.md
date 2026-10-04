# Configuration

All settings use the `ENGINE_` environment prefix. `.env.example` is the reference configuration.

| Variable | Default | Purpose |
|---|---|---|
| `ENGINE_ENV` | development | deployment label |
| `ENGINE_HOST` | 0.0.0.0 | bind address |
| `ENGINE_PORT` | 8000 | bind port |
| `ENGINE_API_KEY` | empty in development | API authentication; required in production (32+ chars) |
| `ENGINE_STORAGE_ROOT` | ./storage-data | source/result/temp root |
| `ENGINE_DATABASE_PATH` | ./storage-data/engine.db | SQLite database |
| `ENGINE_MAX_UPLOAD_BYTES` | 25 MiB | upload cap |
| `ENGINE_MAX_OUTPUT_BYTES` | 50 MiB | output cap |
| `ENGINE_JOB_TIMEOUT_SECONDS` | 300 | hard worker timeout |
| `ENGINE_MAX_CONCURRENCY` | 2 | concurrent isolated workers |
| `ENGINE_RETENTION_HOURS` | 24 | source/result cleanup age |
| `ENGINE_CLEANUP_INTERVAL_SECONDS` | 3600 | cleanup cadence |
| `ENGINE_WEBHOOK_TIMEOUT_SECONDS` | 10 | webhook request timeout |
| `ENGINE_WEBHOOK_RETRIES` | 3 | webhook attempts |
| `ENGINE_WEBHOOK_SECRET` | change-me-in-production | HMAC signing secret; required as a strong value in production |
| `ENGINE_WEBHOOK_ALLOW_PRIVATE` | false | allow webhook targets resolving to private/local addresses |
| `ENGINE_WEBHOOK_REQUIRE_HTTPS` | false | require HTTPS for webhook URLs (forced on in production) |
| `ENGINE_CORS_ORIGINS` | localhost origins | comma-separated browser origins |
| `ENGINE_LOG_LEVEL` | INFO | Python log level |

For production, use a secret manager instead of committing `.env` files.
