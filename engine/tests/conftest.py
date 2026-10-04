from __future__ import annotations

import os
import tempfile
import pytest


@pytest.fixture()
def temp_root(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.setenv("ENGINE_DATABASE_PATH", str(tmp_path / "storage" / "engine.db"))
    monkeypatch.setenv("ENGINE_API_KEY", "test-key")
    monkeypatch.setenv("ENGINE_RETENTION_HOURS", "1")
    monkeypatch.setenv("ENGINE_CLEANUP_INTERVAL_SECONDS", "10")
    from config.settings import get_settings
    get_settings.cache_clear()
    return tmp_path
