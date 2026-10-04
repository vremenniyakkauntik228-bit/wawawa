# NemlleA MVP deployment

The repository is a small monorepo: the website lives at the repository root, while the standalone Document Processing Engine lives in `engine/`.

The included `render.yaml` defines two Render web services from the same Git repository. Render Blueprints support multiple interconnected services and allow a service root directory to be set for monorepos.

1. Push the repository to GitHub.
2. In Render, create a Blueprint from the repository.
3. Set the required secret values when prompted.
4. The web service receives `ENGINE_API_URL` and `ENGINE_API_KEY` from the Engine service.

For the early MVP, treat local SQLite/file storage in the Engine as hobby/demo infrastructure; move to shared object storage and a production database before handling serious workloads.
