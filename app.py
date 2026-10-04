from __future__ import annotations

import os
from pathlib import Path
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
CATALOG_PATH = BASE_DIR / "catalog" / "engines.json"

ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://127.0.0.1:8001").rstrip("/")
ENGINE_API_KEY = os.getenv("ENGINE_API_KEY", "")

app = FastAPI(title="NemlleA", version="0.1.0")


def engine_headers() -> dict[str, str]:
    return {"X-API-Key": ENGINE_API_KEY} if ENGINE_API_KEY else {}


def normalized_engine_url() -> str:
    url = ENGINE_API_URL
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url.rstrip("/")


@app.get("/api/catalog")
def catalog() -> dict:
    return {"engines": __import__("json").loads(CATALOG_PATH.read_text(encoding="utf-8"))}


@app.get("/api/engine/document/manifest")
async def document_manifest() -> dict:
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        try:
            r = await client.get(f"{normalized_engine_url()}/api/v1/manifest", headers=engine_headers())
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Document Engine is unavailable: {exc}") from exc


@app.post("/api/engine/document/files")
async def document_upload(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    files = {"file": (file.filename or "file", content, file.content_type or "application/octet-stream")}
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
        try:
            r = await client.post(f"{normalized_engine_url()}/api/v1/files", headers=engine_headers(), files=files)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:2000]
            raise HTTPException(exc.response.status_code, detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Document Engine is unavailable: {exc}") from exc


@app.post("/api/engine/document/jobs")
async def document_job(payload: dict, idempotency_key: str | None = None) -> dict:
    headers = engine_headers()
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
        try:
            r = await client.post(f"{normalized_engine_url()}/api/v1/jobs", headers=headers, json=payload)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(exc.response.status_code, exc.response.text[:2000]) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Document Engine is unavailable: {exc}") from exc


@app.get("/api/engine/document/jobs/{job_id}")
async def document_job_status(job_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        try:
            r = await client.get(f"{normalized_engine_url()}/api/v1/jobs/{job_id}", headers=engine_headers())
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(exc.response.status_code, exc.response.text[:2000]) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"Document Engine is unavailable: {exc}") from exc


@app.get("/api/engine/document/jobs/{job_id}/download")
async def document_download(job_id: str):
    async def stream() -> AsyncIterator[bytes]:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=False) as client:
            try:
                async with client.stream("GET", f"{normalized_engine_url()}/api/v1/jobs/{job_id}/download", headers=engine_headers()) as r:
                    if r.status_code >= 400:
                        body = await r.aread()
                        raise HTTPException(r.status_code, body.decode(errors="replace")[:2000])
                    async for chunk in r.aiter_bytes():
                        yield chunk
            except httpx.HTTPError as exc:
                raise HTTPException(502, f"Document Engine is unavailable: {exc}") from exc
    return StreamingResponse(stream(), media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename=nemllea-result-{job_id}.bin"})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "nemllea-web"}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
