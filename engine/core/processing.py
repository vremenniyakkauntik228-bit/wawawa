from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from adapters.registry import build_registry
from core.errors import EngineError, UnsupportedFormatError


def _format_from_path(path: str) -> str:
    return Path(path).suffix.lower().lstrip(".")


def read_text(path: str) -> str:
    registry = build_registry()
    fmt = _format_from_path(path)
    try:
        adapter = registry.get(fmt)
    except KeyError:
        raise UnsupportedFormatError(fmt)
    return adapter.extract_text(path)


def analyze(path: str) -> dict[str, Any]:
    text = read_text(path)
    fmt = _format_from_path(path)
    words = re.findall(r"\b\w+\b", text, flags=re.UNICODE)
    lines = text.splitlines()
    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    stats = {
        "format": fmt,
        "characters": len(text),
        "non_whitespace_characters": len(re.sub(r"\s", "", text)),
        "words": len(words),
        "lines": len(lines),
        "paragraphs": len(paragraphs),
        "bytes_utf8": len(text.encode("utf-8")),
    }
    return {"statistics": stats, "preview": text[:1000]}


def validate(path: str) -> dict[str, Any]:
    registry = build_registry()
    fmt = _format_from_path(path)
    try:
        adapter = registry.get(fmt)
    except KeyError:
        raise UnsupportedFormatError(fmt)
    return adapter.validate(path)


def correct_text(text: str) -> tuple[str, dict[str, Any]]:
    before = text
    value = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[\t ]+", " ", value)
    value = re.sub(r"[ ]*\n[ ]*", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([,.;:!?])(?=[^\s\n])", r"\1 ", value)
    value = "\n".join(line.rstrip() for line in value.splitlines()).strip() + ("\n" if value.strip() else "")
    return value, {"changed": value != before, "input_characters": len(before), "output_characters": len(value)}


def write_output(source_path: str, output_path: str, target_format: str, options: dict) -> dict[str, Any]:
    registry = build_registry()
    target_format = target_format.lower().lstrip(".")
    source_format = _format_from_path(source_path)
    try:
        source_adapter = registry.get(source_format)
        target_adapter = registry.get(target_format)
    except KeyError as exc:
        raise UnsupportedFormatError(str(exc))
    text = source_adapter.extract_text(source_path)
    if options.get("correct", False):
        text, correction = correct_text(text)
    else:
        correction = None
    target_adapter.write_from_text(text, output_path, options)
    result = {"source_format": source_format, "target_format": target_format, "characters": len(text)}
    if correction:
        result["correction"] = correction
    return result


def execute_job(source_path: str, output_path: str, operation: str, output_format: str | None, options: dict[str, Any]) -> dict[str, Any]:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    if operation == "extract_text":
        text = read_text(source_path)
        fmt = output_format or "txt"
        registry = build_registry()
        registry.get(fmt).write_from_text(text, output_path, options)
        return {"kind": "text_extraction", "characters": len(text), "format": fmt}
    if operation == "analyze":
        data = analyze(source_path)
        Path(output_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"kind": "analysis", **data["statistics"]}
    if operation == "validate":
        data = validate(source_path)
        Path(output_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return data
    if operation == "correct_text":
        text = read_text(source_path)
        fixed, report = correct_text(text)
        fmt = output_format or "txt"
        build_registry().get(fmt).write_from_text(fixed, output_path, options)
        return {"kind": "correction", "target_format": fmt, **report}
    if operation == "convert":
        if not output_format:
            raise EngineError("missing_output_format", "output_format is required for conversion", 422)
        return write_output(source_path, output_path, output_format, options)
    raise EngineError("unsupported_operation", f"Unsupported operation: {operation}", 422)
