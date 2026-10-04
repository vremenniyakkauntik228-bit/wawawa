class EngineError(Exception):
    """Expected, client-facing engine error."""

    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class NotFoundError(EngineError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__("not_found", message, 404)


class LimitError(EngineError):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__("limit_exceeded", message, 413, details)


class UnsupportedFormatError(EngineError):
    def __init__(self, fmt: str):
        super().__init__("unsupported_format", f"Unsupported document format: {fmt}", 415, {"format": fmt})


class ConflictError(EngineError):
    def __init__(self, message: str):
        super().__init__("conflict", message, 409)
