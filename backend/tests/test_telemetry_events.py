import os
import sys


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
