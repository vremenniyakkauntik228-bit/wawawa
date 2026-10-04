# Integration

The Engine is intentionally independent from UI code. Any frontend or backend can call the REST API.

## Frontend integration

Browser code should:

1. upload to `POST /api/v1/files` using `multipart/form-data` field `file`;
2. create a job via `POST /api/v1/jobs` with JSON;
3. poll `GET /api/v1/jobs/{id}` until the status is terminal, or use the UI's backend to listen for webhooks;
4. fetch `GET /api/v1/jobs/{id}/result` and then the `download` endpoint.

Set `ENGINE_CORS_ORIGINS` to the exact browser origins that are allowed to call the Engine directly.

## Backend-to-backend integration

The preferred production flow is backend-to-Engine. Keep `ENGINE_API_KEY` private and do not expose it in browser code. The application server uploads the source file, creates jobs and downloads results.

## Webhook integration

Provide `webhook_url` when creating the job. The Engine sends JSON events for queueing, progress, completion, failure and timeout. Requests include:

- `X-Engine-Event`
- `X-Engine-Signature` = HMAC-SHA256(body, ENGINE_WEBHOOK_SECRET)

Verify the signature against the raw request body before trusting the payload.

## Idempotency and retries

`POST /api/v1/jobs` supports an `Idempotency-Key` header (1–255 characters). Reusing the same key returns the original job instead of creating a duplicate. The key is stored with the job for persistence across process restarts.
