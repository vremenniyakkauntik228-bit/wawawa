from __future__ import annotations

from pathlib import Path


def health_status(storage_root: str, db_path: str) -> dict:
    storage = Path(storage_root)
    return {
        "status": "ok",
        "storage_writable": storage.exists() and storage.is_dir(),
        "database_configured": bool(db_path),
    }
