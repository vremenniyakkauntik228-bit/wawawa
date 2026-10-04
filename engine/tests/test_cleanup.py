from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from config.settings import get_settings
from core.service import EngineService


def test_cleanup_removes_expired_file(temp_root):
    settings = get_settings()
    service = EngineService(settings)
    p = service.source_root / "old.txt"
    p.write_text("old", encoding="utf-8")
    service.repo.create_file({
        "id": "old-file",
        "original_name": "old.txt",
        "extension": "txt",
        "media_type": "text/plain",
        "size_bytes": 3,
        "sha256": "x",
        "path": str(p),
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(),
    })
    import asyncio
    removed = asyncio.run(service.cleanup())
    assert removed == 1
    assert not p.exists()
