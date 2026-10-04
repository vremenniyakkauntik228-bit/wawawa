from fastapi import Header, Request
from config.settings import Settings, get_settings
from core.errors import EngineError
from core.security import verify_api_key


def get_engine(request: Request):
    return request.app.state.engine


def auth(request: Request, x_api_key: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    settings: Settings = request.app.state.settings
    supplied = x_api_key
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    verify_api_key(settings.api_key, supplied)
    return True
