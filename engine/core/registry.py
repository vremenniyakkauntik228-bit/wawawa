from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from adapters.base import DocumentAdapter


class Processor(Protocol):
    name: str
    def run(self, input_path: str, output_path: str | None, options: dict) -> dict: ...


@dataclass
class AdapterRegistry:
    adapters: dict[str, DocumentAdapter]

    def register(self, adapter: DocumentAdapter) -> None:
        for fmt in adapter.formats:
            self.adapters[fmt] = adapter

    def get(self, fmt: str) -> DocumentAdapter:
        key = fmt.lower().lstrip(".")
        if key not in self.adapters:
            raise KeyError(key)
        return self.adapters[key]
