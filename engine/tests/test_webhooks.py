from pathlib import Path

from core.webhooks import WebhookDispatcher
from config.settings import Settings


def test_webhook_signature():
    settings = Settings(webhook_secret="secret")
    dispatcher = WebhookDispatcher(settings)
    signature = dispatcher.signature(b"hello")
    import hmac, hashlib
    expected = hmac.new(b"secret", b"hello", hashlib.sha256).hexdigest()
    assert signature == expected
