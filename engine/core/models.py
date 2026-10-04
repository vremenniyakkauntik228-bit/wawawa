from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from pydantic import BaseModel, Field, HttpUrl


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"


class Operation(StrEnum):
    ANALYZE = "analyze"
    VALIDATE = "validate"
    EXTRACT_TEXT = "extract_text"
    CORRECT_TEXT = "correct_text"
    CONVERT = "convert"


class JobCreate(BaseModel):
    file_id: str = Field(min_length=1, max_length=128)
    operation: Operation
    output_format: str | None = Field(default=None, max_length=16)
    options: dict[str, Any] = Field(default_factory=dict)
    webhook_url: HttpUrl | None = None


class StoredFile(BaseModel):
    id: str
    original_name: str
    extension: str
    media_type: str
    size_bytes: int
    sha256: str
    path: str
    created_at: datetime


class JobView(BaseModel):
    id: str
    file_id: str
    operation: Operation
    output_format: str | None
    options: dict[str, Any]
    status: JobStatus
    progress: int
    result_path: str | None
    result_media_type: str | None
    result_size_bytes: int | None
    result_summary: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    webhook_url: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
