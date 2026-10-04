# Security

## File handling

- Upload names are reduced to a basename and unsafe characters are sanitized.
- File paths are UUID-based; client-supplied paths never choose the storage location.
- Uploads are streamed in chunks and capped by `ENGINE_MAX_UPLOAD_BYTES`.
- Output files are capped by `ENGINE_MAX_OUTPUT_BYTES`.
- Adapters validate their native structures before processing.
- Temporary files are stored under a dedicated directory and cleaned by retention maintenance.

## API authentication

Set `ENGINE_API_KEY`. In production the Engine refuses to start without a high-entropy API key (minimum 32 characters). Keep API keys server-side; browser applications should generally call their own backend, which calls the Engine.

## Webhooks

Use a high-entropy `ENGINE_WEBHOOK_SECRET`. Verify HMAC signatures using the raw HTTP body. Webhook URLs are validated before use and again before sending. Local/private/reserved destinations are blocked by default, redirects are disabled, environment proxy settings are ignored, and production requires HTTPS. Set `ENGINE_WEBHOOK_ALLOW_PRIVATE=true` only for deliberately controlled internal deployments.

## Isolation and timeouts

Each processing job runs in a separate Python subprocess/process group. When the configured timeout expires, the process is terminated and the job enters `timed_out` state. This prevents a stuck parser from blocking the API worker.

## Storage retention

Source and result artifacts are removed after `ENGINE_RETENTION_HOURS`. Deletion is best-effort but the database record is also removed, so persistent storage permissions must allow the Engine process to delete files.

## Limitations

The built-in local database and queue are intentionally simple. Idempotency is supported at the job-creation layer, but SQLite + in-process queue remains a single-node coordination model. They are not a secure multi-tenant boundary or a distributed scheduler. For strong tenant isolation, add authentication/authorization, quotas and a shared queue/storage adapter suitable for your environment.
