from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.middleware import RequestIdMiddleware
from api.routes import health_router, router
from config.settings import get_settings
from core.errors import EngineError
from core.health import health_status
from core.service import EngineService


logging.basicConfig(level=get_settings().log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    engine = EngineService(settings)
    await engine.start()
    app.state.settings = settings
    app.state.engine = engine
    maintenance = asyncio.create_task(engine.maintenance_loop())
    try:
        yield
    finally:
        maintenance.cancel()
        await asyncio.gather(maintenance, return_exceptions=True)
        await engine.stop()


app = FastAPI(
    title="NemlleA Document Processing Engine",
    version="1.0.2",
    description="Backend-only document processing Engine with asynchronous jobs, safe file handling and adapter-based extensions.",
    lifespan=lifespan,
)
settings = get_settings()
app.add_middleware(RequestIdMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
app.include_router(health_router)
app.include_router(router)


@app.exception_handler(EngineError)
async def engine_error_handler(request: Request, exc: EngineError):
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message, "details": exc.details, "request_id": getattr(request.state, "request_id", None)}})


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logging.getLogger("engine").exception("Unhandled request error")
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "Internal server error", "request_id": getattr(request.state, "request_id", None)}})


@app.get("/", include_in_schema=False)
async def root():
    return {"name": "NemlleA Document Processing Engine", "version": "1.0.1", "api": "/api/v1", "docs": "/docs"}


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}
