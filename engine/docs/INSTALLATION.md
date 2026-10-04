# Installation

## Requirements

- Python 3.11–3.14.
- A filesystem location where the Engine process can create `storage-data/`.
- For the built-in adapters, no external office suite is required.
- Docker is optional.

The runtime dependencies are pinned in `requirements.txt` and mirrored in `pyproject.toml`.

## Local installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.main:app --reload
```

The API listens on `http://127.0.0.1:8000`. Swagger UI is at `/docs`, ReDoc at `/redoc`.

## Windows PowerShell

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn api.main:app --reload
```

## Verify

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/v1/health/live
```
