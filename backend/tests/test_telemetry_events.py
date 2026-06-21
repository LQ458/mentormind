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


def test_sanitize_telemetry_page_strips_query_and_bounds_length():
    assert (
        server._sanitize_telemetry_page(
            "https://mentormind.cloud/study-plan?invite=secret-code#frag"
        )
        == "/study-plan?...#..."
    )
    assert server._sanitize_telemetry_page(None) is None
    assert len(server._sanitize_telemetry_page("/" + ("a" * 120)) or "") == 64


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


def test_survey_optional_text_redacts_embedded_url_values():
    assert server._survey_optional_text("  ", 4000) is None
    assert (
        server._survey_optional_text(
            "Flow broke at https://mentormind.cloud/study-plan?invite=secret#frag",
            4000,
        )
        == "Flow broke at /study-plan?...#..."
    )
    assert len(server._survey_optional_text("x" * 100, 12) or "") == 12


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
    long_note = (
        "Open https://mentormind.cloud/study-plan?invite=secret-code#frag then "
        + ("x" * 1300)
    )
    payload = {
        "user_note": long_note,
        "expected_behavior": "Should stay on /study-plan?token=secret",
        "password": "do-not-store",
        "context": {
            "url": "https://mentormind.cloud/study-plan?token=url-token#frag",
            "app_snapshot": {
                "access_token": "secret-access-token",
                "apiKey": "secret-api-key",
                "safe_value": "kept",
                "message": "Fetch failed https://mentormind.cloud/ask?token=secret#frag",
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

    assert safe["user_note"].startswith("Open /study-plan?...#... then ")
    assert "secret-code" not in safe["user_note"]
    assert len(safe["user_note"]) == 1200
    assert safe["expected_behavior"] == "Should stay on /study-plan?..."
    assert safe["password"] == "[redacted]"
    assert safe["context"]["url"] == "/study-plan?...#..."
    assert safe["context"]["app_snapshot"]["access_token"] == "[redacted]"
    assert safe["context"]["app_snapshot"]["apiKey"] == "[redacted]"
    assert safe["context"]["app_snapshot"]["safe_value"] == "kept"
    assert safe["context"]["app_snapshot"]["message"] == "Fetch failed /ask?...#..."
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


def test_feedback_report_unique_key_groups_explicit_bug_keys():
    assert (
        server._feedback_report_unique_key({"id": "1", "bug_key": "qa-study-plan-spinner"})
        == server._feedback_report_unique_key({"id": "2", "bug_key": "qa-study-plan-spinner"})
    )
    assert server._feedback_report_unique_key({"id": "1", "bug_key": "../bad"}) != server._feedback_report_unique_key({"id": "2", "bug_key": "../bad"})


def test_feedback_report_unique_key_clusters_similar_manual_reports():
    first = {
        "id": "1",
        "surface": "study-plan",
        "feedback_kind": "bug",
        "severity": "blocked",
        "page": "/study-plan",
        "user_note": "The plan keeps spinning forever after I choose AP math.",
        "expected_behavior": "Show all generated units.",
    }
    second = {
        "id": "2",
        "surface": "study-plan",
        "feedback_kind": "bug",
        "severity": "blocked",
        "page": "/study-plan",
        "user_note": "The plan keeps spinning forever after I choose AP math!",
        "expected_behavior": "Show all generated units",
    }

    assert server._feedback_report_unique_key(first) == server._feedback_report_unique_key(second)
    assert server._feedback_report_unique_key({**second, "severity": "wrong"}) != server._feedback_report_unique_key(first)


def test_feedback_report_attach_clusters_marks_duplicate_counts():
    rows = server._feedback_report_attach_clusters([
        {
            "id": "1",
            "surface": "study-plan",
            "feedback_kind": "bug",
            "severity": "blocked",
            "page": "/study-plan",
            "user_note": "The unit generation spinner never ends.",
        },
        {
            "id": "2",
            "surface": "study-plan",
            "feedback_kind": "bug",
            "severity": "blocked",
            "page": "/study-plan",
            "user_note": "The unit generation spinner never ends.",
        },
        {
            "id": "3",
            "surface": "ask",
            "feedback_kind": "bug",
            "severity": "blocked",
            "page": "/ask",
            "user_note": "Bad",
        },
    ])

    assert rows[0]["cluster_key"] == rows[1]["cluster_key"]
    assert rows[0]["cluster_size"] == 2
    assert rows[0]["duplicate_count"] == 1
    assert rows[2]["cluster_size"] == 1


def test_feedback_report_cluster_target_events_returns_anchor_cluster_only():
    anchor = SimpleNamespace(
        id="evt-1",
        event_type="feedback_moment",
        created_at=datetime(2026, 6, 20, 8, 0, 0),
        user_id=None,
        session_id="session-1",
        page="/study-plan",
        url="/study-plan",
        viewport_w=390,
        viewport_h=844,
        payload=valid_feedback_moment_payload(
            user_note="The unit generation spinner never ends.",
            expected_behavior="Show generated units.",
        ),
    )
    duplicate = SimpleNamespace(
        id="evt-2",
        event_type="feedback_moment",
        created_at=datetime(2026, 6, 20, 8, 1, 0),
        user_id=None,
        session_id="session-2",
        page="/study-plan",
        url="/study-plan",
        viewport_w=390,
        viewport_h=844,
        payload=valid_feedback_moment_payload(
            report_id="fm-study_plan-review-def456",
            user_note="The unit generation spinner never ends!",
            expected_behavior="Show generated units",
        ),
    )
    different = SimpleNamespace(
        id="evt-3",
        event_type="feedback_moment",
        created_at=datetime(2026, 6, 20, 8, 2, 0),
        user_id=None,
        session_id="session-3",
        page="/ask",
        url="/ask",
        viewport_w=390,
        viewport_h=844,
        payload=valid_feedback_moment_payload(
            surface="ask",
            report_id="fm-ask-review-ghi789",
            user_note="Upload failed.",
            expected_behavior="Answer the image.",
        ),
    )
    non_feedback = SimpleNamespace(
        id="evt-4",
        event_type="error_console",
        created_at=datetime(2026, 6, 20, 8, 3, 0),
        payload={},
    )

    targets = server._feedback_report_cluster_target_events(
        anchor,
        [duplicate, different, non_feedback, anchor],
    )

    assert [event.id for event in targets] == ["evt-1", "evt-2"]


def test_feedback_report_cluster_summaries_rank_by_priority_and_count():
    rows = server._feedback_report_attach_clusters([
        {
            "id": "evt-1",
            "report_id": "report-1",
            "created_at": "2026-06-20T08:00:00",
            "surface": "study-plan",
            "feedback_kind": "bug",
            "severity": "blocked",
            "user_note": "The unit generation spinner never ends.",
            "expected_behavior": "Show generated units.",
        },
        {
            "id": "evt-2",
            "report_id": "report-2",
            "created_at": "2026-06-20T09:00:00",
            "surface": "study-plan",
            "feedback_kind": "bug",
            "severity": "blocked",
            "user_note": "The unit generation spinner never ends!",
            "expected_behavior": "Show generated units",
        },
        {
            "id": "evt-3",
            "report_id": "report-3",
            "created_at": "2026-06-20T10:00:00",
            "surface": "home",
            "feedback_kind": "general",
            "severity": "idea",
            "user_note": "Add another color theme.",
        },
    ])

    clusters = server._feedback_report_cluster_summaries(rows)

    assert clusters[0]["count"] == 2
    assert clusters[0]["duplicate_count"] == 1
    assert clusters[0]["surface"] == "study-plan"
    assert clusters[0]["severity"] == "blocked"
    assert clusters[0]["representative_report_id"] == "report-2"
    assert clusters[0]["priority_score"] > clusters[1]["priority_score"]


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
        triage_status=None,
    )
    assert not server._feedback_report_matches(
        row,
        source="local_report_button",
        surface="study-plan",
        kind="bug",
        severity="blocked",
        triage_status=None,
    )
    assert server._feedback_report_matches(
        {**row, "triage_status": "engineering"},
        source=None,
        surface=None,
        kind=None,
        severity=None,
        triage_status="engineering",
    )
    assert not server._feedback_report_matches(
        {**row, "triage_status": "resolved"},
        source=None,
        surface=None,
        kind=None,
        severity=None,
        triage_status="engineering",
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


def test_feedback_report_query_normalization_trims_and_caps_search_text():
    long_query = f"  {'x' * 240}  "

    assert server._normalize_feedback_report_query(long_query) == "x" * server.FEEDBACK_REPORT_QUERY_MAX_CHARS
    assert server._normalize_feedback_report_query(None) == ""


def test_feedback_report_choice_filters_trim_and_normalize_valid_values():
    assert (
        server._normalize_feedback_report_choice_filter(" Bug ", server.FEEDBACK_MOMENT_ALLOWED_KINDS)
        == "bug"
    )
    assert (
        server._normalize_feedback_report_choice_filter("WRONG", server.FEEDBACK_MOMENT_ALLOWED_SEVERITIES)
        == "wrong"
    )
    assert (
        server._normalize_feedback_report_choice_filter("not-a-kind", server.FEEDBACK_MOMENT_ALLOWED_KINDS)
        == "not-a-kind"
    )
    assert server._normalize_feedback_report_choice_filter(None, server.FEEDBACK_MOMENT_ALLOWED_KINDS) is None


def test_feedback_report_token_filters_trim_without_disabling_invalid_values():
    assert server._normalize_feedback_report_token_filter(" study-plan:hero ") == "study-plan:hero"
    assert server._normalize_feedback_report_token_filter(" ") is None
    assert server._normalize_feedback_report_token_filter("../secret") == "../secret"


def test_feedback_report_id_query_accepts_only_safe_exact_ids():
    assert (
        server._normalize_feedback_report_id_query(" fb-study-plan-bug-abc123 ")
        == "fb-study-plan-bug-abc123"
    )
    assert server._normalize_feedback_report_id_query("../secret") == ""
    assert server._normalize_feedback_report_id_query("bad report id") == ""
    assert server._normalize_feedback_report_id_query("<script>alert(1)</script>") == ""


def test_feedback_report_id_filter_clause_uses_json_payload_field():
    clause = server._feedback_report_id_filter_clause("fb-study-plan-bug-abc123")

    assert clause is not None
    assert server._feedback_report_id_filter_clause("bad report id") is None
    assert "payload" in str(clause)


def test_feedback_triage_status_normalization_and_note_sanitization():
    assert server._normalize_feedback_triage_status("content-ceo") == "content_ceo"
    assert server._normalize_feedback_triage_status("resolved") == "resolved"
    assert server._normalize_feedback_triage_status("unknown") == "new"
    assert (
        server._sanitize_feedback_triage_note("Needs CEO: https://mentormind.cloud/admin?token=secret")
        == "Needs CEO: /admin?..."
    )


def test_feedback_report_to_dict_includes_default_and_saved_triage_fields():
    row = server._feedback_report_to_dict(
        SimpleNamespace(
            id="evt-1",
            created_at=datetime(2026, 6, 20, 8, 0, 0),
            user_id=None,
            session_id="session-1",
            page="/study-plan",
            url="/study-plan",
            viewport_w=390,
            viewport_h=844,
            payload=valid_feedback_moment_payload(
                triage_status="content_ceo",
                triage_note="Need course scaffolding.",
                triage_updated_at="2026-06-20T09:00:00",
                triage_updated_by="admin-1",
            ),
        )
    )

    assert row["triage_status"] == "content_ceo"
    assert row["triage_note"] == "Need course scaffolding."
    assert row["triage_updated_at"] == "2026-06-20T09:00:00"
    assert row["triage_updated_by"] == "admin-1"


def test_feedback_report_priority_prefers_blocked_bug_with_errors():
    high = {
        "severity": "blocked",
        "feedback_kind": "bug",
        "user_note": "The plan never finishes.",
        "expected_behavior": "Show a failure state.",
        "recent_errors": [{"event_type": "error_network"}, {"event_type": "ws_close"}],
        "cluster_size": 3,
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
    assert "duplicates:3" in high_reasons
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
        {
            "id": "closed-blocked",
            "created_at": "2026-06-20T11:00:00",
            "severity": "blocked",
            "feedback_kind": "bug",
            "triage_status": "resolved",
            "recent_errors": [{"event_type": "error_network"}],
        },
    ]

    queue = server._feedback_report_priority_queue(rows, limit=3)

    assert [row["id"] for row in queue] == ["newer-blocked", "newer-idea"]
    assert queue[0]["priority_reasons"] == ["severity:blocked", "bug", "errors:1"]
    assert [row.get("report_id") for row in queue].count("same-bug") == 1
    assert "closed-blocked" not in [row["id"] for row in queue]


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
