from __future__ import annotations

import pytest

from config.settings import Settings
from core.errors import EngineError
from core.network import validate_webhook_url


def test_production_requires_strong_secrets():
    with pytest.raises(ValueError):
        Settings(env="production", api_key="short", webhook_secret="short")


@pytest.mark.asyncio
async def test_webhook_blocks_local_ip():
    with pytest.raises(EngineError) as exc:
        await validate_webhook_url("http://127.0.0.1/hook")
    assert exc.value.code == "webhook_target_blocked"


@pytest.mark.asyncio
async def test_webhook_rejects_credentials():
    with pytest.raises(EngineError) as exc:
        await validate_webhook_url("https://user:pass@example.com/hook")
    assert exc.value.code == "invalid_webhook_url"


def test_manifest_version():
    import json
    from pathlib import Path
    manifest = json.loads((Path(__file__).parents[1] / "engine.json").read_text())
    assert manifest["version"] == "1.0.2"
    assert "job-cancellation" in manifest["capabilities"]


def test_identity_file_is_official_and_stable():
    import json
    from pathlib import Path
    identity = json.loads((Path(__file__).parents[1] / "NEMLLEA_ENGINE.json").read_text())
    assert identity["engine"]["engine_id"] == "DOC-ENAKS-272"
    assert identity["engine"]["serial"] == "353-NEA-$#$-798-1.0.2-engiNemll"
    assert identity["engine"]["status"] == "official"
