from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import httpx

from config.settings import Settings
from core.network import validate_webhook_url


class WebhookDispatcher:
    def __init__(self, settings: Settings):
        self.settings = settings

    def signature(self, body: bytes) -> str:
        secret = self.settings.webhook_secret.encode()
        return hmac.new(secret, body, hashlib.sha256).hexdigest()

    async def send(self, url: str, payload: dict) -> None:
        await validate_webhook_url(
            url,
            allow_private=self.settings.webhook_allow_private,
            require_https=self.settings.webhook_require_https,
        )
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        headers = {
            "Content-Type": "application/json",
            "X-Engine-Signature": self.signature(body),
            "X-Engine-Event": payload.get("event", "job.event"),
        }
        last_exc = None
        for attempt in range(self.settings.webhook_retries):
            try:
                # trust_env=False prevents ambient proxy settings from bypassing URL safety.
                async with httpx.AsyncClient(
                    timeout=self.settings.webhook_timeout_seconds,
                    follow_redirects=False,
                    trust_env=False,
                ) as client:
                    response = await client.post(url, content=body, headers=headers)
                    if 200 <= response.status_code < 300:
                        return
                    last_exc = RuntimeError(f"Webhook returned HTTP {response.status_code}")
            except Exception as exc:
                last_exc = exc
            await asyncio.sleep(min(2 ** attempt, 5))
        if last_exc:
            raise last_exc
