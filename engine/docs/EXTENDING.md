# Extending the Engine

Extension is organized around explicit interfaces instead of modifying core processing code.

## Add a document format adapter

Implement `adapters.base.DocumentAdapter`:

```python
from adapters.base import DocumentAdapter

class RtfAdapter(DocumentAdapter):
    formats = ("rtf",)
    media_types = ("application/rtf",)

    def extract_text(self, path: str) -> str:
        ...

    def validate(self, path: str) -> dict:
        ...

    def write_from_text(self, text: str, path: str, options: dict) -> None:
        ...
```

Register it in `adapters/registry.py`. Core services then discover the format through the shared registry.

## Add a processor/operation

Add a pure function (or class) in `core/processing.py`, then add an operation enum value and route it through `execute_job`. The worker contract does not need to change.

For larger integrations, create a dedicated `core/processors/` package and register processors by operation name.

## Add storage

Implement `adapters.base.StorageAdapter` (`path_for`, `put_path`, `delete`) and register it in `adapters/storage_registry.py`. The core already obtains its source/result/tmp locations through `build_storage`, so a custom backend can replace the local implementation without changing API or job logic.

For object storage such as S3/GCS/Azure, the adapter should materialize an object to a safe local processing path and upload the produced result back to the object store. Keep provider-specific code inside the adapter package.

## Add a hosting adapter

Hosting adapters belong under `deploy/` or a separate package. They should configure environment, persistent storage, health probes and process supervision, but must not alter the core document-processing contracts.

## Add an API integration layer

The API router is intentionally versioned. Add a new router under `api/` and mount it beneath a versioned path. Keep framework-specific logic in `api/` and domain logic in `core/`.

## Testing extensions

Add unit tests under `tests/`. At minimum, verify:

- valid and invalid files;
- size/timeout limits;
- conversion output;
- adapter validation;
- error responses;
- cleanup and retention behavior.
