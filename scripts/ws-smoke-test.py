#!/usr/bin/env python3
"""Smoke-test the production board WebSocket upgrade path.

This intentionally uses an invalid token. The backend accepts the WebSocket
first and then sends a structured auth error, so a healthy proxy path returns
HTTP 101 Switching Protocols. HTTP 404/502/504 means the request never reached
the FastAPI WebSocket endpoint correctly.
"""

from __future__ import annotations

import argparse
import base64
import os
import socket
import ssl
from urllib.parse import urlparse


ZERO_SESSION = "00000000-0000-0000-0000-000000000000"


def _to_ws_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if not parsed.scheme:
        parsed = urlparse(f"https://{base_url}")
    scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or parsed.path
    return f"{scheme}://{netloc}/ws/board/{ZERO_SESSION}?token=invalid-smoke-token"


def _handshake(url: str, timeout: float) -> tuple[int | None, str]:
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise ValueError(f"Invalid WebSocket URL: {url}")
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"

    key = base64.b64encode(os.urandom(16)).decode("ascii")
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {parsed.netloc}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "User-Agent: mentormind-ws-smoke-test\r\n"
        "\r\n"
    ).encode("ascii")

    raw = socket.create_connection((host, port), timeout=timeout)
    try:
        raw.settimeout(timeout)
        sock: socket.socket
        if parsed.scheme == "wss":
            context = ssl.create_default_context()
            sock = context.wrap_socket(raw, server_hostname=host)
        else:
            sock = raw

        with sock:
            sock.sendall(request)
            chunks: list[bytes] = []
            while b"\r\n\r\n" not in b"".join(chunks):
                chunk = sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)
                if sum(len(c) for c in chunks) > 65536:
                    break
    finally:
        try:
            raw.close()
        except OSError:
            pass

    response = b"".join(chunks).decode("iso-8859-1", errors="replace")
    status_line = response.splitlines()[0] if response else ""
    parts = status_line.split()
    status = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else None
    return status, response


def _diagnosis(status: int | None) -> str:
    if status == 101:
        return "OK: WebSocket upgrade reached the backend."
    if status == 502:
        return "FAIL: nginx could not reach the upstream for /ws/. Check proxy_pass target and Docker network."
    if status == 504:
        return "FAIL: nginx timed out connecting to /ws/ upstream."
    if status == 404:
        return "FAIL: /ws/ is not routed to the backend WebSocket endpoint."
    if status in {301, 302, 307, 308}:
        return "FAIL: WebSocket upgrade was redirected. Use the final HTTPS domain directly."
    if status in {400, 426}:
        return "FAIL: upgrade headers were not preserved by the proxy."
    return f"FAIL: unexpected WebSocket handshake status {status}."


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "base_url",
        nargs="?",
        default=os.getenv("NEXT_PUBLIC_APP_URL") or os.getenv("PUBLIC_APP_URL") or "https://mentormind.cloud",
        help="Public app base URL, e.g. https://mentormind.cloud",
    )
    parser.add_argument("--timeout", type=float, default=10)
    args = parser.parse_args()

    url = _to_ws_url(args.base_url)
    print(f"Testing {url}")
    try:
        status, response = _handshake(url, args.timeout)
    except Exception as exc:
        print(f"FAIL: WebSocket TCP/TLS handshake failed: {exc}")
        return 2

    status_line = response.splitlines()[0] if response else "<no response>"
    print(status_line)
    print(_diagnosis(status))
    if status != 101:
        print("\nResponse headers/body preview:")
        print(response[:1200])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
