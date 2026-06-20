import os
import sys
from types import SimpleNamespace


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_websocket_auth_token_prefers_query_token():
    websocket = SimpleNamespace(
        query_params={"token": "query-token"},
        cookies={"mm_token": "cookie-token"},
    )

    assert server._websocket_auth_token(websocket) == "query-token"


def test_websocket_auth_token_uses_http_only_cookie_fallback():
    websocket = SimpleNamespace(
        query_params={},
        cookies={"mm_token": "cookie-token"},
    )

    assert server._websocket_auth_token(websocket) == "cookie-token"


def test_websocket_auth_token_returns_none_without_session():
    websocket = SimpleNamespace(query_params={}, cookies={})

    assert server._websocket_auth_token(websocket) is None
