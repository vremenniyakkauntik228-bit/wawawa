# Changelog

## 1.0.2
- Added queued/running job cancellation and safe retry.
- Added persistent `Idempotency-Key` support for job creation.
- Added webhook SSRF/local-target validation and production HTTPS enforcement.
- Health endpoints are public so container/orchestrator health checks work even when API authentication is enabled.
- Worker termination now uses process groups on POSIX and strips unrelated environment secrets.
- Result downloads are constrained to the Engine result directory.
- Retention cleanup skips files with queued/running jobs.
- Production startup now requires strong API/webhook secrets.


All notable changes to this project are documented here.

## [1.0.0] - 2026-10-04

### Added
- Versioned REST API under `/api/v1`.
- Upload, validation, extraction, analysis, correction and text-oriented conversion.
- Persistent asynchronous jobs with status/progress/events.
- Isolated worker subprocesses with hard termination on timeout.
- Signed webhook delivery with retries.
- Local storage and adapter interfaces for storage and document formats.
- Automatic retention cleanup for source and result artifacts.
- API key authentication, request IDs, CORS configuration and file safety checks.
- OpenAPI documentation plus developer integration/extension guides.
- Automated tests for health, upload, jobs, conversion, validation and cleanup.
