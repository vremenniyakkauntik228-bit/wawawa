from __future__ import annotations

from pathlib import Path
from shutil import copyfile

from adapters.base import StorageAdapter


class LocalStorageAdapter(StorageAdapter):
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, key: str) -> Path:
        candidate = (self.root / key).resolve()
        candidate.relative_to(self.root)
        return candidate

    def put_path(self, source_path: str | Path, key: str) -> Path:
        source = Path(source_path).resolve()
        destination = self.path_for(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        copyfile(source, destination)
        return destination

    def delete(self, key: str) -> None:
        self.path_for(key).unlink(missing_ok=True)
