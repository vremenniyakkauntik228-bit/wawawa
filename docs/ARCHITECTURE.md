# Architecture

```text
Browser
  |
  v
NemlleA Web (FastAPI + static UI)
  |
  | server-to-server
  v
Document Processing Engine
  |
  +-- API
  +-- worker subprocesses
  +-- storage adapter
  +-- format adapters
```

The website never needs the Engine API key in browser JavaScript. This keeps the Engine connector server-side.
