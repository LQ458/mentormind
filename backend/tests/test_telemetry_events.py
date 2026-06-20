import os
import sys
from datetime import datetime
from types import SimpleNamespace


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from database.models.telemetry import ALLOWED_EVENT_TYPES
import server


def test_feedback_moment_is_allowed_telemetry_event():
    assert "feedback_moment" in ALLOWED_EVENT_TYPES


def test_redact_url_for_telemetry_strips_query_and_fragment_values():
    assert (
        server._redact_url_for_telemetry(
            "https://mentormind.cloud/auth/login?invite=secret-code&token=abc#section"
        )
        == "/auth/login?...#..."
    )
    assert server._redact_url_for_telemetry("/study-plan?source=quick-question") == "/study-plan?..."
    assert server._redact_url_for_telemetry("/dashboard") == "/dashboard"


def test_sanitize_telemetry_payload_redacts_sensitive_keys_before_storage():
    payload = {
        "user_note": "x" * 1300,
        "password": "do-not-store",
        "context": {
            "url": "https://mentormind.cloud/study-plan?token=url-token#frag",
            "app_snapshot": {
                "access_token": "secret-access-token",
                "apiKey": "secret-api-key",
                "safe_value": "kept",
                "headers": {
                    "Authorization": "Bearer raw-token",
                    "content_type": "application/json",
                },
            },
            "events": [
                {
                    "refresh-token": "refresh-secret",
                    "url": "/board/abc?invite=secret",
                    "status": 500,
                }
            ],
        },
    }

    safe = server._sanitize_telemetry_payload("feedback_moment", payload)

    assert safe["user_note"] == "x" * 1200
    assert safe["password"] == "[redacted]"
    assert safe["context"]["url"] == "/study-plan?...#..."
    assert safe["context"]["app_snapshot"]["access_token"] == "[redacted]"
    assert safe["context"]["app_snapshot"]["apiKey"] == "[redacted]"
    assert safe["context"]["app_snapshot"]["safe_value"] == "kept"
    assert safe["context"]["app_snapshot"]["headers"]["Authorization"] == "[redacted]"
    assert safe["context"]["app_snapshot"]["headers"]["content_type"] == "application/json"
    assert safe["context"]["events"][0]["refresh-token"] == "[redacted]"
    assert safe["context"]["events"][0]["url"] == "/board/abc?..."
    assert safe["context"]["events"][0]["status"] == 500


def test_sensitive_telemetry_key_detection_covers_admin_context_identifiers():
    for key in ["apiKey", "clientSecret", "sessionToken", "user_agent", "ipAddress", "inviteCode"]:
        assert server._is_sensitive_telemetry_key(key)


def test_feedback_report_unique_key_dedupes_explicit_report_ids_only():
    assert (
        server._feedback_report_unique_key({"id": "1", "report_id": "qa-abc"})
        == server._feedback_report_unique_key({"id": "2", "report_id": "qa-abc"})
    )
    assert server._feedback_report_unique_key({"id": "1", "report_id": ""}) != server._feedback_report_unique_key({"id": "2"})


def test_feedback_report_matches_supports_source_filter():
    row = {
        "source": "prod_autopilot_qa",
        "surface": "study-plan",
        "feedback_kind": "bug",
        "severity": "blocked",
    }
    assert server._feedback_report_matches(
        row,
        source="prod_autopilot_qa",
        surface="study-plan",
        kind="bug",
        severity="blocked",
    )
    assert not server._feedback_report_matches(
        row,
        source="local_report_button",
        surface="study-plan",
        kind="bug",
        severity="blocked",
    )


def test_feedback_report_priority_prefers_blocked_bug_with_errors():
    high = {
        "severity": "blocked",
        "feedback_kind": "bug",
        "user_note": "The plan never finishes.",
        "expected_behavior": "Show a failure state.",
        "recent_errors": [{"event_type": "error_network"}, {"event_type": "ws_close"}],
    }
    low = {
        "severity": "idea",
        "feedback_kind": "general",
        "user_note": "Maybe add more colors.",
        "recent_errors": [],
    }

    high_score, high_reasons = server._feedback_report_priority(high)
    low_score, low_reasons = server._feedback_report_priority(low)

    assert high_score > low_score
    assert "severity:blocked" in high_reasons
    assert "bug" in high_reasons
    assert "errors:2" in high_reasons
    assert low_reasons == ["severity:idea", "has_note"]


def test_feedback_report_priority_queue_dedupes_and_orders_newest_ties():
    rows = [
        {
            "id": "newer-idea",
            "created_at": "2026-06-20T09:00:00",
            "severity": "idea",
            "feedback_kind": "general",
            "user_note": "Nice to have",
        },
        {
            "id": "older-blocked",
            "created_at": "2026-06-20T08:00:00",
            "report_id": "same-bug",
            "severity": "blocked",
            "feedback_kind": "bug",
            "recent_errors": [{"event_type": "error_network"}],
        },
        {
            "id": "newer-blocked",
            "created_at": "2026-06-20T10:00:00",
            "report_id": "same-bug",
            "severity": "blocked",
            "feedback_kind": "bug",
            "recent_errors": [{"event_type": "error_network"}],
        },
        {
            "id": "older-idea",
            "created_at": "2026-06-20T07:00:00",
            "severity": "idea",
            "feedback_kind": "general",
            "user_note": "Nice to have",
        },
    ]

    queue = server._feedback_report_priority_queue(rows, limit=3)

    assert [row["id"] for row in queue] == ["newer-blocked", "newer-idea", "older-idea"]
    assert queue[0]["priority_reasons"] == ["severity:blocked", "bug", "errors:1"]
    assert [row.get("report_id") for row in queue].count("same-bug") == 1


def test_feedback_context_event_shape_omits_ip_and_user_agent():
    row = server._telemetry_context_event_to_dict(
        SimpleNamespace(
            id="evt-1",
            created_at=datetime(2026, 6, 20, 8, 0, 0),
            event_type="error_console",
            page="/study-plan",
            url="/study-plan",
            latency_ms=None,
            payload={"message": "boom"},
            viewport_w=390,
            viewport_h=844,
            ip_address="203.0.113.10",
            user_agent="secret browser",
        )
    )

    assert row["id"] == "evt-1"
    assert row["event_type"] == "error_console"
    assert row["payload"]["message"] == "boom"
    assert "ip_address" not in row
    assert "user_agent" not in row
