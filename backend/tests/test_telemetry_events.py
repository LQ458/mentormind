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
