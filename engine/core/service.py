from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from config.settings import Settings
from core.errors import EngineError, LimitError, NotFoundError
from core.network import validate_webhook_url
from core.security import path_is_inside
from core.models import JobCreate, JobStatus, JobView
from core.repository import Repository, row_to_job
from core.security import sanitize_filename
from core.webhooks import WebhookDispatcher
from adapters.storage_registry import build_storage
from workers.manager import WorkerManager


class EngineService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.repo = Repository(settings.database_path)
        self.storage = build_storage(settings.storage_root)
        self.root = self.storage.root
        self.source_root = self.storage.path_for("sources")
        self.result_root = self.storage.path_for("results")
        self.tmp_root = self.storage.path_for("tmp")
        for p in (self.source_root, self.result_root, self.tmp_root):
            p.mkdir(parents=True, exist_ok=True)
        self.webhooks = WebhookDispatcher(settings)
        self.worker = WorkerManager(self)

    async def save_upload(self, upload: UploadFile) -> dict[str, Any]:
        safe_name = sanitize_filename(upload.filename or "file")
        ext = Path(safe_name).suffix.lower().lstrip(".")
        if not ext:
            raise EngineError("missing_extension", "File extension is required", 422)
        if ext not in self.supported_formats():
            raise EngineError("unsupported_format", f"Unsupported file extension: .{ext}", 415)
        file_id = uuid.uuid4().hex
        destination = self.storage.path_for(f"sources/{file_id}.{ext}")
        total = 0
        sha = hashlib.sha256()
        try:
            with destination.open("wb") as out:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > self.settings.max_upload_bytes:
                        raise LimitError("Upload exceeds configured maximum size", {"max_bytes": self.settings.max_upload_bytes})
                    sha.update(chunk)
                    out.write(chunk)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        data = {
            "id": file_id,
            "original_name": safe_name,
            "extension": ext,
            "media_type": mimetypes.guess_type(safe_name)[0] or upload.content_type or "application/octet-stream",
            "size_bytes": total,
            "sha256": sha.hexdigest(),
            "path": str(destination),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.repo.create_file(data)
        return data

    def supported_formats(self) -> set[str]:
        from adapters.registry import build_registry
        return set(build_registry().adapters.keys())

    async def create_job(self, payload: JobCreate, idempotency_key: str | None = None) -> JobView:
        if idempotency_key is not None:
            idempotency_key = idempotency_key.strip()
            if not idempotency_key or len(idempotency_key) > 255:
                raise EngineError("invalid_idempotency_key", "Idempotency-Key must be between 1 and 255 characters", 422)
        row = self.repo.get_file(payload.file_id)
        if not row:
            raise NotFoundError("Source file not found")
        from adapters.registry import build_registry
        formats = build_registry().adapters.keys()
        requested_format = payload.output_format.lower().lstrip(".") if payload.output_format else None
        if requested_format and requested_format not in formats:
            raise EngineError("unsupported_format", f"Unsupported output format: {payload.output_format}", 415)
        operation = payload.operation.value
        if payload.webhook_url:
            await validate_webhook_url(
                str(payload.webhook_url),
                allow_private=self.settings.webhook_allow_private,
                require_https=self.settings.webhook_require_https,
            )
        if operation in {"analyze", "validate"}:
            normalized_format = "json"
        elif operation in {"extract_text", "correct_text"}:
            normalized_format = requested_format or "txt"
        else:
            if not requested_format:
                raise EngineError("missing_output_format", "output_format is required for conversion", 422)
            normalized_format = requested_format
        canonical = {
            "file_id": payload.file_id,
            "operation": operation,
            "output_format": normalized_format,
            "options": payload.options,
            "webhook_url": str(payload.webhook_url) if payload.webhook_url else None,
        }
        request_hash = hashlib.sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if idempotency_key:
            previous = self.repo.get_job_by_idempotency_key(idempotency_key)
            if previous:
                previous_hash = previous["idempotency_request_hash"] or ""
                if previous_hash and previous_hash != request_hash:
                    raise EngineError("idempotency_conflict", "Idempotency-Key was already used with a different request", 409)
                return JobView(**row_to_job(previous))
        job_id = uuid.uuid4().hex
        created = datetime.now(timezone.utc).isoformat()
        data = {
            "id": job_id,
            "file_id": payload.file_id,
            "operation": operation,
            "output_format": normalized_format,
            "options": payload.options,
            "webhook_url": str(payload.webhook_url) if payload.webhook_url else None,
            "created_at": created,
        }
        self.repo.create_job(data)
        if idempotency_key:
            try:
                self.repo.bind_idempotency_key(idempotency_key, job_id, request_hash, created)
            except Exception:
                existing = self.repo.get_job_by_idempotency_key(idempotency_key)
                if existing:
                    return JobView(**row_to_job(existing))
                raise
        self.repo.add_event(job_id, "job.queued", {"status": JobStatus.QUEUED.value, "progress": 0})
        await self.worker.enqueue(job_id)
        return JobView(**row_to_job(self.repo.get_job(job_id)))

    def is_result_path_safe(self, path: Path) -> bool:
        return path_is_inside(self.result_root, path)

    async def cancel_job(self, job_id: str) -> JobView:
        row = self.repo.get_job(job_id)
        if not row:
            raise NotFoundError("Job not found")
        if row["status"] in {JobStatus.COMPLETED.value, JobStatus.FAILED.value, JobStatus.TIMED_OUT.value, JobStatus.CANCELLED.value}:
            return JobView(**row_to_job(row))
        await self.worker.cancel(job_id)
        return self.get_job(job_id)

    async def retry_job(self, job_id: str) -> JobView:
        row = self.repo.get_job(job_id)
        if not row:
            raise NotFoundError("Job not found")
        if not self.repo.reset_job_for_retry(job_id):
            raise EngineError("job_not_retryable", "Only failed, timed out or cancelled jobs can be retried", 409)
        result_path = row["result_path"]
        if result_path:
            path = Path(result_path)
            if self.is_result_path_safe(path):
                path.unlink(missing_ok=True)
        await self.worker.enqueue(job_id)
        await self.publish_event(job_id, "job.queued", {"status": JobStatus.QUEUED.value, "progress": 0, "reason": "retry"})
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> JobView:
        row = self.repo.get_job(job_id)
        if not row:
            raise NotFoundError("Job not found")
        return JobView(**row_to_job(row))

    def result_path(self, job_id: str) -> Path | None:
        row = self.repo.get_job(job_id)
        return Path(row["result_path"]) if row and row["result_path"] else None

    def delete_file(self, file_id: str) -> None:
        row = self.repo.get_file(file_id)
        if not row:
            raise NotFoundError("File not found")
        with self.repo._connect() as conn:
            active = conn.execute("SELECT COUNT(*) FROM jobs WHERE file_id=? AND status IN ('queued','running')", (file_id,)).fetchone()[0]
        if active:
            raise EngineError("file_in_use", "Cannot delete a file while jobs are queued or running", 409)
        Path(row["path"]).unlink(missing_ok=True)
        self.repo.delete_file(file_id)

    def list_events(self, job_id: str) -> list[dict[str, Any]]:
        if not self.repo.get_job(job_id):
            raise NotFoundError("Job not found")
        return [
            {"id": r["id"], "type": r["event_type"], "payload": json.loads(r["payload_json"]), "created_at": r["created_at"]}
            for r in self.repo.list_events(job_id)
        ]

    async def publish_event(self, job_id: str, event_type: str, payload: dict[str, Any]) -> None:
        self.repo.add_event(job_id, event_type, payload)
        row = self.repo.get_job(job_id)
        if row and row["webhook_url"]:
            try:
                await self.webhooks.send(row["webhook_url"], {"event": event_type, "job_id": job_id, "timestamp": datetime.now(timezone.utc).isoformat(), **payload})
            except Exception as exc:
                self.repo.add_event(job_id, "webhook.failed", {"event": event_type, "error": str(exc)[:1000]})

    async def cleanup(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=self.settings.retention_hours)
        count = 0
        for row in self.repo.cleanup_candidates(cutoff.isoformat()):
            source = Path(row["path"])
            source.unlink(missing_ok=True)
            with self.repo._connect() as conn:
                job_rows = conn.execute("SELECT result_path FROM jobs WHERE file_id=?", (row["id"],)).fetchall()
            for jr in job_rows:
                if jr[0]:
                    Path(jr[0]).unlink(missing_ok=True)
            self.repo.delete_file(row["id"])
            count += 1
        for p in self.tmp_root.glob("**/*"):
            if p.is_file():
                try:
                    if datetime.fromtimestamp(p.stat().st_mtime, timezone.utc) < cutoff:
                        p.unlink(missing_ok=True)
                except FileNotFoundError:
                    pass
        return count

    async def start(self) -> None:
        for job_id in self.repo.queued_jobs():
            await self.worker.enqueue(job_id)
        for job_id in self.repo.stale_running_jobs():
            self.repo.finish_job(job_id, JobStatus.FAILED, progress=100, error_code="worker_restarted", error_message="Worker restarted while job was running")
        await self.worker.start()

    async def stop(self) -> None:
        await self.worker.stop()

    async def maintenance_loop(self):
        while True:
            await asyncio.sleep(self.settings.cleanup_interval_seconds)
            try:
                await self.cleanup()
            except Exception:
                pass
