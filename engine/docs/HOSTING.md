# Hosting

The Engine is not tied to any single hosting provider.

## Docker host / VM

Use the included Dockerfile or Docker Compose. Persist `/app/storage-data` to a volume. A reverse proxy should terminate HTTPS and forward requests to port 8000. Health checks can use the public `/api/v1/health/live` and `/api/v1/health/ready` endpoints.

## Managed container platform

Build the Docker image and configure environment variables in the platform's secret/config mechanism. Ensure persistent storage is available or replace the local storage adapter with shared/object storage before expecting files to survive instance replacement.

## Kubernetes

Run the Engine in a Deployment. Mount a PersistentVolumeClaim for local storage, or use an object-storage adapter. Readiness should target `/api/v1/health/ready`, and liveness can target `/api/v1/health/live`.

For multiple replicas, use shared/object storage and move the job queue/repository behind a shared datastore/queue extension. The included SQLite + in-process queue is intended as the portable default, not as a distributed cluster coordinator.

## systemd

`deploy/nemllea-engine.service.example` shows a minimal VM setup. Create a dedicated Unix user, use a virtual environment, and grant that user access only to the Engine storage path.

## Resource guidance

Minimum: 1 vCPU, 512 MB RAM, 1 GB storage for development/small jobs.

Recommended starting point: 2 vCPU, 2 GB RAM, 10 GB persistent storage. Increase RAM/CPU for concurrent large PDFs/DOCX and increase storage based on configured retention and traffic volume.
