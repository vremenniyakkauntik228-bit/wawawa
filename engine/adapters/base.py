from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class DocumentAdapter(ABC):
    formats: tuple[str, ...] = ()
    media_types: tuple[str, ...] = ()

    @abstractmethod
    def extract_text(self, path: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def validate(self, path: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    def write_from_text(self, text: str, path: str, options: dict) -> None:
        raise NotImplementedError


class StorageAdapter(ABC):
    """Path-oriented storage contract used by the core.

    A custom implementation may use a mounted shared volume or materialize
    remote objects into temporary local paths for processing libraries.
    """

    name = "base"

    @abstractmethod
    def path_for(self, key: str) -> Path:
        raise NotImplementedError

    @abstractmethod
    def put_path(self, source_path: str | Path, key: str) -> Path:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError
