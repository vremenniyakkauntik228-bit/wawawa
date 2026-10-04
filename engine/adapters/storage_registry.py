from __future__ import annotations

from adapters.base import StorageAdapter
from adapters.storage_local import LocalStorageAdapter


def build_storage(root: str) -> StorageAdapter:
    # Replace/extend this factory to register shared-volume, S3, GCS, Azure,
    # database-backed or other storage implementations.
    return LocalStorageAdapter(root)
