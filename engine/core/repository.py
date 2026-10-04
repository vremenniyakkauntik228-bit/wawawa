from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

from core.models import JobStatus, Operation


def _dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value)


class Repository:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS files (
                    id TEXT PRIMARY KEY,
                    original_name TEXT NOT NULL,
                    extension TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                    operation TEXT NOT NULL,
                    output_format TEXT,
                    options_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    result_path TEXT,
                    result_media_type TEXT,
                    result_size_bytes INTEGER,
                    result_summary_json TEXT,
                    error_code TEXT,
                    error_message TEXT,
                    webhook_url TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT
                );
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
                CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id, id);
                CREATE TABLE IF NOT EXISTS idempotency_keys (
                    key TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                    request_hash TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                """
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(idempotency_keys)").fetchall()}
            if "request_hash" not in columns:
                conn.execute("ALTER TABLE idempotency_keys ADD COLUMN request_hash TEXT NOT NULL DEFAULT ''")

    def create_file(self, data: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO files(id,original_name,extension,media_type,size_bytes,sha256,path,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (data["id"], data["original_name"], data["extension"], data["media_type"], data["size_bytes"], data["sha256"], data["path"], data["created_at"]),
            )

    def get_file(self, file_id: str):
        with self._connect() as conn:
            return conn.execute("SELECT * FROM files WHERE id=?", (file_id,)).fetchone()

    def list_files(self):
        with self._connect() as conn:
            return conn.execute("SELECT * FROM files ORDER BY created_at DESC").fetchall()

    def delete_file(self, file_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM files WHERE id=?", (file_id,))

    def create_job(self, data: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO jobs(id,file_id,operation,output_format,options_json,status,progress,webhook_url,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (data["id"], data["file_id"], data["operation"], data.get("output_format"), json.dumps(data.get("options", {})), JobStatus.QUEUED.value, 0, data.get("webhook_url"), data["created_at"]),
            )

    def bind_idempotency_key(self, key: str, job_id: str, request_hash: str, created_at: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO idempotency_keys(key,job_id,request_hash,created_at) VALUES(?,?,?,?)",
                (key, job_id, request_hash, created_at),
            )

    def get_job_by_idempotency_key(self, key: str):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT j.*, i.request_hash AS idempotency_request_hash FROM idempotency_keys i JOIN jobs j ON j.id=i.job_id WHERE i.key=?",
                (key,),
            ).fetchone()
            return row

    def claim_queued_job(self, job_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            row = conn.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not row or row["status"] != JobStatus.QUEUED.value:
                return False
            cur = conn.execute(
                "UPDATE jobs SET status=?, progress=?, started_at=? WHERE id=? AND status=?",
                (JobStatus.RUNNING.value, 5, now, job_id, JobStatus.QUEUED.value),
            )
            return cur.rowcount == 1

    def update_progress(self, job_id: str, progress: int) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE jobs SET progress=? WHERE id=?", (max(0, min(100, progress)), job_id))

    def finish_job(self, job_id: str, status: JobStatus, **fields) -> None:
        now = datetime.now(timezone.utc).isoformat()
        values = {"status": status.value, "finished_at": now, **fields}
        assignments = ",".join(f"{k}=?" for k in values)
        with self._connect() as conn:
            conn.execute(f"UPDATE jobs SET {assignments} WHERE id=?", (*values.values(), job_id))

    def cancel_queued_job(self, job_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE jobs SET status=?, progress=?, error_code=?, error_message=?, finished_at=? WHERE id=? AND status=?",
                (JobStatus.CANCELLED.value, 100, "cancelled", "Job cancelled before processing started", now, job_id, JobStatus.QUEUED.value),
            )
            return cur.rowcount == 1

    def reset_job_for_retry(self, job_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT status, result_path FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not row or row["status"] not in {
                JobStatus.FAILED.value, JobStatus.TIMED_OUT.value, JobStatus.CANCELLED.value
            }:
                return False
            conn.execute(
                "UPDATE jobs SET status=?, progress=0, result_path=NULL, result_media_type=NULL, result_size_bytes=NULL, result_summary_json=NULL, error_code=NULL, error_message=NULL, started_at=NULL, finished_at=NULL WHERE id=?",
                (JobStatus.QUEUED.value, job_id),
            )
            return True

    def get_job(self, job_id: str):
        with self._connect() as conn:
            return conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()

    def list_events(self, job_id: str):
        with self._connect() as conn:
            return conn.execute("SELECT * FROM events WHERE job_id=? ORDER BY id", (job_id,)).fetchall()

    def add_event(self, job_id: str, event_type: str, payload: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO events(job_id,event_type,payload_json,created_at) VALUES(?,?,?,?)",
                (job_id, event_type, json.dumps(payload, default=str), datetime.now(timezone.utc).isoformat()),
            )

    def stale_running_jobs(self) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute("SELECT id FROM jobs WHERE status=?", (JobStatus.RUNNING.value,)).fetchall()
            return [r["id"] for r in rows]

    def queued_jobs(self) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute("SELECT id FROM jobs WHERE status=? ORDER BY created_at", (JobStatus.QUEUED.value,)).fetchall()
            return [r["id"] for r in rows]

    def cleanup_candidates(self, cutoff_iso: str):
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT f.*
                FROM files f
                WHERE f.created_at < ?
                  AND NOT EXISTS (
                    SELECT 1 FROM jobs j
                    WHERE j.file_id = f.id
                      AND j.status IN (?, ?)
                  )
                """,
                (cutoff_iso, JobStatus.QUEUED.value, JobStatus.RUNNING.value),
            ).fetchall()
            return rows

    def close(self) -> None:
        pass


def row_to_job(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "file_id": row["file_id"],
        "operation": Operation(row["operation"]),
        "output_format": row["output_format"],
        "options": json.loads(row["options_json"] or "{}"),
        "status": JobStatus(row["status"]),
        "progress": row["progress"],
        "result_path": row["result_path"],
        "result_media_type": row["result_media_type"],
        "result_size_bytes": row["result_size_bytes"],
        "result_summary": json.loads(row["result_summary_json"]) if row["result_summary_json"] else None,
        "error_code": row["error_code"],
        "error_message": row["error_message"],
        "webhook_url": row["webhook_url"],
        "created_at": _dt(row["created_at"]),
        "started_at": _dt(row["started_at"]),
        "finished_at": _dt(row["finished_at"]),
    }
