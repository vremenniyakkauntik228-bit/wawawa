from __future__ import annotations

import re
import secrets
from pathlib import Path

from core.errors import EngineError

SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")


def sanitize_filename(name: str) -> str:
    raw = Path(name or "file").name.replace("\\", "_").replace("/", "_")
    raw = SAFE_NAME.sub("_", raw).strip(" .") or "file"
    return raw[:120]


def verify_api_key(configured: str | None, supplied: str | None) -> None:
    if not configured:
        return
    if not supplied or not secrets.compare_digest(configured, supplied):
        raise EngineError("unauthorized", "Valid API key required", 401)


def path_is_inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
