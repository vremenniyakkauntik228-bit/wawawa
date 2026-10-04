from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, Depends, File, Header, UploadFile
import json
from fastapi.responses import FileResponse

from core.models import JobCreate
from api.deps import auth, get_engine
from core.service import EngineService
from core.errors import NotFoundError

health_router = APIRouter(prefix="/api/v1/health")
router = APIRouter(prefix="/api/v1", dependencies=[Depends(auth)])


@health_router.get("/live", include_in_schema=True)
async def liveness():
    return {"status": "ok"}


@health_router.get("/ready")
async def readiness(engine: EngineService = Depends(get_engine)):
    return {"status": "ready", "supported_formats": sorted(engine.supported_formats())}




@router.get("/manifest")
async def manifest():
    manifest_path = Path(__file__).resolve().parents[1] / "engine.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    identity_path = Path(__file__).resolve().parents[1] / "NEMLLEA_ENGINE.json"
    if identity_path.is_file():
        identity = json.loads(identity_path.read_text(encoding="utf-8"))
        data["nemllea_identity"] = identity
    return data

@router.get("/formats")
async def formats(engine: EngineService = Depends(get_engine)):
    from adapters.registry import build_registry
    registry = build_registry()
    return {"formats": sorted(registry.adapters.keys())}


@router.post("/files", status_code=201)
async def upload_file(file: UploadFile = File(...), engine: EngineService = Depends(get_engine)):
    stored = await engine.save_upload(file)
    stored.pop("path", None)
    return stored


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: str, engine: EngineService = Depends(get_engine)):
    engine.delete_file(file_id)
    return None


@router.post("/jobs", status_code=202)
async def create_job(
    payload: JobCreate,
    engine: EngineService = Depends(get_engine),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    job = await engine.create_job(payload, idempotency_key=idempotency_key)
    return job.model_dump(mode="json", exclude={"result_path"})


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, engine: EngineService = Depends(get_engine)):
    return engine.get_job(job_id).model_dump(mode="json", exclude={"result_path"})


@router.post("/jobs/{job_id}/cancel", status_code=202)
async def cancel_job(job_id: str, engine: EngineService = Depends(get_engine)):
    job = await engine.cancel_job(job_id)
    return job.model_dump(mode="json", exclude={"result_path"})


@router.post("/jobs/{job_id}/retry", status_code=202)
async def retry_job(job_id: str, engine: EngineService = Depends(get_engine)):
    job = await engine.retry_job(job_id)
    return job.model_dump(mode="json", exclude={"result_path"})


@router.get("/jobs/{job_id}/result")
async def get_result(job_id: str, engine: EngineService = Depends(get_engine)):
    job = engine.get_job(job_id)
    data = {"job": job.model_dump(mode="json", exclude={"result_path"}), "download_url": f"/api/v1/jobs/{job_id}/download" if job.result_path else None}
    return data


@router.get("/jobs/{job_id}/download")
async def download_result(job_id: str, engine: EngineService = Depends(get_engine)):
    job = engine.get_job(job_id)
    if not job.result_path:
        raise NotFoundError("Job has no result artifact")
    path = Path(job.result_path).resolve()
    if not path.is_file() or not engine.is_result_path_safe(path):
        raise NotFoundError("Result artifact is missing")
    return FileResponse(path, media_type=job.result_media_type or "application/octet-stream", filename=path.name)


@router.get("/jobs/{job_id}/events")
async def events(job_id: str, engine: EngineService = Depends(get_engine)):
    return {"events": engine.list_events(job_id)}
