from __future__ import annotations

from core.registry import AdapterRegistry
from adapters.text import TextAdapter, JsonAdapter
from adapters.docx import DocxAdapter
from adapters.pdf import PdfAdapter


def build_registry() -> AdapterRegistry:
    registry = AdapterRegistry({})
    registry.register(TextAdapter("txt"))
    registry.register(TextAdapter("md"))
    registry.register(JsonAdapter())
    registry.register(DocxAdapter())
    registry.register(PdfAdapter())
    return registry
