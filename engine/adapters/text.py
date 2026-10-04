from __future__ import annotations

import json
from pathlib import Path
from core.errors import EngineError
from adapters.base import DocumentAdapter


class TextAdapter(DocumentAdapter):
    def __init__(self, fmt: str):
        self.formats = (fmt,)
        self.media_types = ("text/plain", "text/markdown") if fmt in {"txt", "md"} else ()

    def extract_text(self, path: str) -> str:
        return Path(path).read_text(encoding="utf-8-sig")

    def validate(self, path: str) -> dict:
        try:
            text = self.extract_text(path)
            return {"valid": True, "format": self.formats[0], "characters": len(text)}
        except UnicodeDecodeError as exc:
            raise EngineError("invalid_encoding", "Text file must be valid UTF-8", 422, {"reason": str(exc)})

    def write_from_text(self, text: str, path: str, options: dict) -> None:
        Path(path).write_text(text, encoding="utf-8")


class JsonAdapter(DocumentAdapter):
    formats = ("json",)
    media_types = ("application/json",)

    def extract_text(self, path: str) -> str:
        data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
        if isinstance(data, str):
            return data
        if isinstance(data, dict) and "text" in data:
            value = data["text"]
            return "\n".join(map(str, value)) if isinstance(value, list) else str(value)
        return json.dumps(data, ensure_ascii=False, indent=2)

    def validate(self, path: str) -> dict:
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
            return {"valid": True, "format": "json", "root_type": type(data).__name__}
        except Exception as exc:
            raise EngineError("invalid_json", "JSON document is not valid", 422, {"reason": str(exc)})

    def write_from_text(self, text: str, path: str, options: dict) -> None:
        payload = {"text": text}
        Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
