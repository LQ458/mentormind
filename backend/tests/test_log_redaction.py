import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_redact_sensitive_log_data_recurses_through_payloads():
    payload = {
        "username": "tester",
        "password": "secret-password",
        "nested": {
            "invite_code": "INVITE123",
            "token": "jwt-token",
            "notes": "keep this",
        },
        "items": [{"authorization": "Bearer abc"}],
    }

    redacted = server._redact_sensitive_log_data(payload)

    assert redacted["username"] == "tester"
    assert redacted["password"] == "[redacted]"
    assert redacted["nested"]["invite_code"] == "[redacted]"
    assert redacted["nested"]["token"] == "[redacted]"
    assert redacted["nested"]["notes"] == "keep this"
    assert redacted["items"][0]["authorization"] == "[redacted]"


def test_redact_sensitive_log_text_handles_json_and_query_strings():
    text = '{"password":"secret-password","token":"jwt-token"} /auth/login?invite_code=INVITE123&next=/study-plan Bearer abc.def'

    redacted = server._redact_sensitive_log_text(text)

    assert "secret-password" not in redacted
    assert "jwt-token" not in redacted
    assert "INVITE123" not in redacted
    assert "abc.def" not in redacted
    assert "[redacted]" in redacted


def test_redact_url_for_logs_strips_query_and_fragment_values():
    assert (
        server._redact_url_for_logs("https://mentormind.cloud/auth/login?invite=secret-code&token=abc#section")
        == "/auth/login?...#..."
    )
    assert server._redact_url_for_logs("/study-plan?source=quick-question") == "/study-plan?..."
    assert server._redact_url_for_logs("/dashboard") == "/dashboard"
