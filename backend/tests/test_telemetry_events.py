import os
import sys
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


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


def test_sanitize_telemetry_session_id_accepts_only_safe_client_ids():
    assert server._sanitize_telemetry_session_id("550e8400-e29b-41d4-a716-446655440000")
    assert server._sanitize_telemetry_session_id(" tlm-lx3e4f-abc12345 ") == "tlm-lx3e4f-abc12345"
    assert server._sanitize_telemetry_session_id("ssr") == "ssr"
    assert server._sanitize_telemetry_session_id("x") is None
    assert server._sanitize_telemetry_session_id("bad session") is None
    assert server._sanitize_telemetry_session_id("../secret") is None
    assert server._sanitize_telemetry_session_id("a" * 256) is None
    assert server._sanitize_telemetry_session_id(None) is None


def test_sanitize_survey_contact_email_normalizes_valid_email():
    assert server._sanitize_survey_contact_email(" Tester@Example.COM ") == "tester@example.com"
    assert server._sanitize_survey_contact_email("") is None
    assert server._sanitize_survey_contact_email(None) is None


@pytest.mark.parametrize(
    "value",
    [
        "not-an-email",
        "tester @example.com",
        "tester@example",
        "tester@example.com\nbcc:evil@example.com",
        "a" * 260 + "@example.com",
    ],
)
def test_sanitize_survey_contact_email_rejects_invalid_email(value):
    with pytest.raises(HTTPException) as exc:
        server._sanitize_survey_contact_email(value)

    assert exc.value.status_code == 400


def test_survey_has_substantive_answer_rejects_blank_payload():
    assert not server._survey_has_substantive_answer(
        exam=None,
        school_year=None,
        prior_tools=[],
        likert={},
        pmf_score=None,
        nps=None,
        pain_point=None,
        feature_request=None,
        other_feedback=None,
        contact_email=None,
    )


def test_survey_has_substantive_answer_accepts_partial_feedback_metadata():
    assert server._survey_has_substantive_answer(
        exam="other",
        school_year="other",
        prior_tools=[],
        likert={},
        pmf_score=None,
        nps=None,
        pain_point=None,
        feature_request=None,
        other_feedback="tradeoffs={}",
        contact_email=None,
    )


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


def valid_feedback_moment_payload(**overrides):
    payload = {
        "source": "inline_feedback_moment",
        "feedback_kind": "bug",
        "severity": "wrong",
        "surface": "study_plan_review",
        "interaction_id": "study-plan:review-1",
        "report_id": "fm-study_plan-review-abc123",
        "user_note": "Plan generation failed.",
        "expected_behavior": "",
        "context": {},
    }
    payload.update(overrides)
    return payload


def test_validate_feedback_moment_payload_accepts_official_payloads_and_normalizes_choices():
    payload = valid_feedback_moment_payload(
        source="INLINE_FEEDBACK_MOMENT",
        feedback_kind="BUG",
        severity="WRONG",
    )

    server._validate_feedback_moment_payload(payload)

    assert payload["source"] == "inline_feedback_moment"
    assert payload["feedback_kind"] == "bug"
    assert payload["severity"] == "wrong"


def test_validate_feedback_moment_payload_accepts_all_official_sources():
    for source in server.FEEDBACK_MOMENT_ALLOWED_SOURCES:
        payload = valid_feedback_moment_payload(source=source)
        server._validate_feedback_moment_payload(payload)


def test_validate_feedback_moment_payload_accepts_error_context_without_note():
    payload = valid_feedback_moment_payload(
        user_note="",
        expected_behavior="",
        context={"recent_errors": [{"event_type": "error_network"}]},
    )

    server._validate_feedback_moment_payload(payload)


@pytest.mark.parametrize(
    "overrides",
    [
        {"user_note": "", "expected_behavior": "", "context": {}},
        {"source": "random_script"},
        {"feedback_kind": "other"},
        {"severity": "urgent"},
        {"surface": "../secret"},
        {"report_id": "bad report id"},
        {"interaction_id": "<script>alert(1)</script>"},
    ],
)
def test_validate_feedback_moment_payload_rejects_empty_or_unstructured_reports(overrides):
    payload = valid_feedback_moment_payload(**overrides)

    with pytest.raises(HTTPException) as exc:
        server._validate_feedback_moment_payload(payload)

    assert exc.value.status_code == 400


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


def test_feedback_report_query_matches_report_text_and_tester_metadata():
    row = {
        "id": "evt-1",
        "report_id": "fb-study-plan-bug-abc123",
        "page": "/study-plan",
        "user_note": "Plan generation spins forever.",
        "expected_behavior": "Show all units after generation.",
        "tester": {
            "username": "tester_one",
            "email": "tester@example.com",
            "language_preference": "zh",
        },
        "build": {
            "sha": "abc123def456",
            "image_tag": "prod",
        },
    }

    assert server._feedback_report_matches_query(row, "fb-study-plan-bug")
    assert server._feedback_report_matches_query(row, "spins forever")
    assert server._feedback_report_matches_query(row, "tester_one")
    assert server._feedback_report_matches_query(row, "abc123def")
    assert not server._feedback_report_matches_query(row, "seminar-audio")


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
