"""Minimal webhook receiver example.

Run with: uvicorn examples.webhook_receiver:app --port 9000
Point a job's webhook_url to http://host.docker.internal:9000/webhook when appropriate.
"""

import hashlib
import hmac
import os

from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI(title="Engine webhook example")
SECRET = os.getenv("ENGINE_WEBHOOK_SECRET", "change-me-in-production")


@app.post("/webhook")
async def webhook(request: Request, x_engine_signature: str | None = Header(default=None)):
    body = await request.body()
    expected = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not x_engine_signature or not hmac.compare_digest(expected, x_engine_signature):
        raise HTTPException(status_code=401, detail="invalid signature")
    return {"accepted": True, "event": request.headers.get("X-Engine-Event")}
