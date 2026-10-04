from __future__ import annotations

import asyncio

import httpx
import pytest


@pytest.mark.asyncio
async def test_upload_and_job_flow(temp_root):
    from api.main import app
    from config.settings import get_settings
    from core.service import EngineService

    settings = get_settings()
    app.state.settings = settings
    app.state.engine = EngineService(settings)
    await app.state.engine.start()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            health = await client.get("/api/v1/health/live", headers={"X-API-Key": "test-key"})
            assert health.status_code == 200

            upload = await client.post(
                "/api/v1/files",
                headers={"X-API-Key": "test-key"},
                files={"file": ("hello.txt", b"Hello  engine !", "text/plain")},
            )
            assert upload.status_code == 201
            file_id = upload.json()["id"]

            job_resp = await client.post(
                "/api/v1/jobs",
                headers={"X-API-Key": "test-key"},
                json={"file_id": file_id, "operation": "correct_text", "output_format": "txt"},
            )
            assert job_resp.status_code == 202
            job_id = job_resp.json()["id"]

            state = None
            for _ in range(100):
                await asyncio.sleep(0.05)
                status = await client.get(f"/api/v1/jobs/{job_id}", headers={"X-API-Key": "test-key"})
                state = status.json()["status"]
                if state == "completed":
                    break
            assert state == "completed"

            events = await client.get(f"/api/v1/jobs/{job_id}/events", headers={"X-API-Key": "test-key"})
            assert any(e["type"] == "job.completed" for e in events.json()["events"])

            result = await client.get(f"/api/v1/jobs/{job_id}/download", headers={"X-API-Key": "test-key"})
            assert result.status_code == 200
            assert b"Hello engine!" in result.content
    finally:
        await app.state.engine.stop()


@pytest.mark.asyncio
async def test_auth_required(temp_root):
    from api.main import app
    from config.settings import get_settings
    from core.service import EngineService

    settings = get_settings()
    app.state.settings = settings
    app.state.engine = EngineService(settings)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/formats")
            assert response.status_code == 401
    finally:
        await app.state.engine.stop()


@pytest.mark.asyncio
async def test_upload_limit(temp_root, monkeypatch):
    from api.main import app
    from config.settings import get_settings
    from core.service import EngineService

    settings = get_settings()
    settings.max_upload_bytes = 4
    app.state.settings = settings
    app.state.engine = EngineService(settings)
    await app.state.engine.start()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/files",
                headers={"X-API-Key": "test-key"},
                files={"file": ("large.txt", b"12345", "text/plain")},
            )
            assert response.status_code == 413
            assert response.json()["error"]["code"] == "limit_exceeded"
    finally:
        await app.state.engine.stop()


@pytest.mark.asyncio
async def test_job_idempotency_cancel_and_retry(temp_root):
    from api.main import app
    from config.settings import get_settings
    from core.service import EngineService

    settings = get_settings()
    app.state.settings = settings
    app.state.engine = EngineService(settings)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            upload = await client.post(
                "/api/v1/files",
                headers={"X-API-Key": "test-key"},
                files={"file": ("hello.txt", b"hello", "text/plain")},
            )
            assert upload.status_code == 201
            file_id = upload.json()["id"]
            headers = {"X-API-Key": "test-key", "Idempotency-Key": "same-job"}
            first = await client.post("/api/v1/jobs", headers=headers, json={"file_id": file_id, "operation": "correct_text", "output_format": "txt"})
            second = await client.post("/api/v1/jobs", headers=headers, json={"file_id": file_id, "operation": "correct_text", "output_format": "txt"})
            assert first.status_code == second.status_code == 202
            assert first.json()["id"] == second.json()["id"]

            job_id = first.json()["id"]
            cancel = await client.post(f"/api/v1/jobs/{job_id}/cancel", headers={"X-API-Key": "test-key"})
            assert cancel.status_code == 202
            assert cancel.json()["status"] == "cancelled"

            retry = await client.post(f"/api/v1/jobs/{job_id}/retry", headers={"X-API-Key": "test-key"})
            assert retry.status_code == 202
            assert retry.json()["status"] == "queued"

            await app.state.engine.start()
            for _ in range(100):
                await asyncio.sleep(0.05)
                state = (await client.get(f"/api/v1/jobs/{job_id}", headers={"X-API-Key": "test-key"})).json()["status"]
                if state == "completed":
                    break
            assert state == "completed"
    finally:
        await app.state.engine.stop()



@pytest.mark.asyncio
async def test_public_outputs_hide_internal_paths(temp_root):
    from api.main import app
    from config.settings import get_settings
    from core.service import EngineService
    settings = get_settings()
    app.state.settings = settings
    app.state.engine = EngineService(settings)
    await app.state.engine.start()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            upload = await client.post("/api/v1/files", headers={"X-API-Key": "test-key"}, files={"file": ("hello.txt", b"hello", "text/plain")})
            assert upload.status_code == 201
            assert "path" not in upload.json()
            file_id = upload.json()["id"]
            job = await client.post("/api/v1/jobs", headers={"X-API-Key": "test-key"}, json={"file_id": file_id, "operation": "correct_text", "output_format": "txt"})
            job_id = job.json()["id"]
            for _ in range(100):
                await asyncio.sleep(0.05)
                status = await client.get(f"/api/v1/jobs/{job_id}", headers={"X-API-Key": "test-key"})
                if status.json()["status"] == "completed":
                    break
            assert "result_path" not in status.json()
    finally:
        await app.state.engine.stop()
