# NemlleA MVP

A first working NemlleA Engine Platform shell with the official Document Processing Engine 1.0.2 integrated through a server-side connector.

## Includes

- dark, strict NemlleA interface inspired by the supplied logo/reference;
- Engine catalog;
- Official / Community separation;
- Engine ID + serial + version display;
- real Document Processing Engine test flow;
- server-side Engine API proxy (API key never exposed to browser);
- Render Blueprint for web + Engine services;
- privacy/developer rules placeholders;
- standalone `engine/` release with `NEMLLEA_ENGINE.json`.

## Local

Terminal 1:

```bash
cd engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
ENGINE_ENV=development ENGINE_API_KEY=test-key uvicorn api.main:app --port 8001
```

Terminal 2:

```bash
pip install -r requirements.txt
ENGINE_API_URL=http://127.0.0.1:8001 ENGINE_API_KEY=test-key uvicorn app:app --port 8000
```

Open `http://127.0.0.1:8000`.
