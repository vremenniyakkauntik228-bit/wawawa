from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from core.errors import EngineError


def _blocked_ip(ip_text: str) -> bool:
    ip = ipaddress.ip_address(ip_text)
    return any((
        ip.is_private, ip.is_loopback, ip.is_link_local, ip.is_reserved,
        ip.is_multicast, ip.is_unspecified,
    ))


def _resolve_ips(hostname: str, port: int) -> set[str]:
    results = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    return {item[4][0] for item in results}


async def validate_webhook_url(
    url: str,
    *,
    allow_private: bool = False,
    require_https: bool = False,
) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise EngineError("invalid_webhook_url", "Webhook URL must use http or https", 422)
    if require_https and parsed.scheme != "https":
        raise EngineError("invalid_webhook_url", "HTTPS is required for webhooks in production", 422)
    if not parsed.hostname:
        raise EngineError("invalid_webhook_url", "Webhook URL must include a hostname", 422)
    if parsed.username or parsed.password:
        raise EngineError("invalid_webhook_url", "Webhook URL must not contain embedded credentials", 422)
    if any(ch.isspace() for ch in url):
        raise EngineError("invalid_webhook_url", "Webhook URL must not contain whitespace", 422)
    if parsed.port is None:
        port = 443 if parsed.scheme == "https" else 80
    else:
        port = parsed.port

    host = parsed.hostname.strip(".")
    try:
        ip = ipaddress.ip_address(host)
        ips = {str(ip)}
    except ValueError:
        try:
            ips = await asyncio.to_thread(_resolve_ips, host, port)
        except socket.gaierror:
            raise EngineError("invalid_webhook_url", "Webhook hostname could not be resolved", 422)
        if not ips:
            raise EngineError("invalid_webhook_url", "Webhook hostname has no resolved addresses", 422)

    if not allow_private:
        blocked = sorted(ip for ip in ips if _blocked_ip(ip))
        if blocked:
            raise EngineError(
                "webhook_target_blocked",
                "Webhook target resolves to a private, local, reserved or otherwise unsafe address",
                422,
                {"addresses": blocked},
            )
