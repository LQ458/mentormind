import asyncio
import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def test_admin_metrics_rejects_non_admin_before_db_access():
    user = SimpleNamespace(role="student")

    with pytest.raises(HTTPException) as exc_info:
        server.get_admin_metrics(current_user=user, db=None)

    assert exc_info.value.status_code == 403


def test_admin_allowlist_accepts_configured_username(monkeypatch):
    monkeypatch.setenv("MENTORMIND_ADMIN_USERS", "owner_user")
    user = SimpleNamespace(
        id="user-1",
        username="owner_user",
        email="owner@example.com",
        role="student",
    )

    server._require_admin(user)


def test_admin_allowlist_accepts_configured_email_case_insensitive(monkeypatch):
    monkeypatch.setenv("MENTORMIND_ADMIN_USERS", "Owner@Example.com")
    user = SimpleNamespace(
        id="user-1",
        username="owner_user",
        email="owner@example.com",
        role="student",
    )

    server._require_admin(user)


def test_admin_allowlist_accepts_configured_user_id(monkeypatch):
    monkeypatch.setenv("MENTORMIND_ADMIN_USERS", "user-1")
    user = SimpleNamespace(
        id="user-1",
        username="ordinary_user",
        email="ordinary@example.com",
        role="student",
    )

    server._require_admin(user)


@pytest.mark.parametrize(
    "invoke",
    [
        lambda user: server.get_ops_queue_depths(current_user=user),
        lambda user: server.get_performance_metrics(current_user=user),
        lambda user: server.get_lesson_generation_metrics(current_user=user),
        lambda user: server.get_content_quality_analytics(current_user=user),
        lambda user: server.get_lesson_quality("lesson-1", current_user=user),
        lambda user: server.debug_generation_pipeline(
            server.GenerationDebugRequest(topic="calculus", content="limits"),
            current_user=user,
        ),
        lambda user: server.debug_generation_video_script(
            server.GenerationDebugRequest(topic="calculus", content="limits"),
            current_user=user,
        ),
    ],
)
def test_ops_and_monitoring_endpoints_reject_non_admin_before_work(invoke):
    user = SimpleNamespace(role="student")

    with pytest.raises(HTTPException) as exc_info:
        result = invoke(user)
        if hasattr(result, "__await__"):
            asyncio.run(result)

    assert exc_info.value.status_code == 403


def test_detailed_health_check_rejects_non_admin_before_monitoring_work():
    user = SimpleNamespace(role="student")

    with patch.object(server.monitor, "get_system_metrics") as get_system_metrics:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(server.detailed_health_check(current_user=user))

    assert exc_info.value.status_code == 403
    get_system_metrics.assert_not_called()


@pytest.mark.parametrize(
    "invoke",
    [
        lambda user: server.get_admin_telemetry_aggregate(current_user=user, db=None),
        lambda user: server.get_admin_feedback_reports(current_user=user, db=None),
        lambda user: server.get_admin_feedback_report_context("evt-1", current_user=user, db=None),
        lambda user: server.get_admin_feedback_reports_aggregate(current_user=user, db=None),
        lambda user: server.get_admin_feedback(current_user=user, db=None),
        lambda user: server.get_admin_feedback_aggregate(current_user=user, db=None),
    ],
)
def test_feedback_and_telemetry_admin_data_reject_non_admin_before_db_access(invoke):
    user = SimpleNamespace(role="student")

    with pytest.raises(HTTPException) as exc_info:
        result = invoke(user)
        if hasattr(result, "__await__"):
            asyncio.run(result)

    assert exc_info.value.status_code == 403


def test_survey_admin_rows_omit_network_identifiers():
    row = SimpleNamespace(
        to_dict=lambda: {
            "id": "survey-1",
            "pain_point": "The plan stalled.",
            "contact_email": "tester@example.com",
            "ip_address": "203.0.113.10",
            "user_agent": "SensitiveBrowser/1.0",
        },
    )

    data = server._survey_response_admin_to_dict(row)

    assert data["contact_email"] == "tester@example.com"
    assert "ip_address" not in data
    assert "user_agent" not in data


def test_feedback_context_admin_payload_redacts_sensitive_fields():
    event = SimpleNamespace(
        id="evt-1",
        created_at=None,
        event_type="feedback_moment",
        page="/study-plan",
        url="/study-plan?token=secret-value",
        latency_ms=120,
        payload={
            "context": {
                "browser": {
                    "language": "en-US",
                    "user_agent": "SensitiveBrowser/1.0",
                },
                "app_snapshot": {
                    "access_token": "secret",
                    "apiKey": "secret-api-key",
                    "clientSecret": "secret-client-secret",
                    "sessionToken": "secret-session-token",
                    "safe_value": "kept",
                    "url": "https://mentormind.cloud/study-plan?invite=abc#frag",
                },
            }
        },
        viewport_w=390,
        viewport_h=844,
    )

    data = server._telemetry_context_event_to_dict(event)
    context = data["payload"]["context"]

    assert context["browser"]["language"] == "en-US"
    assert context["browser"]["user_agent"] == "[redacted]"
    assert context["app_snapshot"]["access_token"] == "[redacted]"
    assert context["app_snapshot"]["apiKey"] == "[redacted]"
    assert context["app_snapshot"]["clientSecret"] == "[redacted]"
    assert context["app_snapshot"]["sessionToken"] == "[redacted]"
    assert context["app_snapshot"]["safe_value"] == "kept"
    assert context["app_snapshot"]["url"] == "/study-plan?...#..."


def test_feedback_report_admin_urls_redact_query_and_fragment():
    event = SimpleNamespace(
        id="evt-2",
        created_at=None,
        user_id=None,
        session_id="session-1",
        page="/study-plan?token=page-token",
        url="https://mentormind.cloud/study-plan?invite=abc#frag",
        viewport_w=390,
        viewport_h=844,
        payload={
            "source": "inline_feedback_moment",
            "context": {
                "build": {
                    "sha": "abc123",
                    "image_tag": "prod",
                    "sessionToken": "secret-session-token",
                },
                "route": "/study-plan/abc?token=route-token",
                "url": "https://mentormind.cloud/study-plan/abc?token=url-token#hash",
            },
        },
    )

    data = server._feedback_report_to_dict(event)

    assert data["page"] == "/study-plan?..."
    assert data["url"] == "/study-plan?...#..."
    assert data["route"] == "/study-plan/abc?..."
    assert data["captured_url"] == "/study-plan/abc?...#..."
    assert data["build"]["sha"] == "abc123"
    assert data["build"]["image_tag"] == "prod"
    assert data["build"]["sessionToken"] == "[redacted]"
    assert data["priority_score"] >= 0
    assert isinstance(data["priority_reasons"], list)


def test_feedback_report_includes_safe_tester_summary():
    tester = SimpleNamespace(
        id="user-1",
        username="tester_one",
        email="tester@example.com",
        role="student",
        language_preference="zh",
        created_at=datetime(2026, 6, 20, 8, 0, 0),
        last_login_at=datetime(2026, 6, 20, 9, 0, 0),
        hashed_password="do-not-include",
    )
    event = SimpleNamespace(
        id="evt-3",
        created_at=None,
        user_id="user-1",
        session_id="session-1",
        page="/study-plan",
        url="/study-plan",
        viewport_w=390,
        viewport_h=844,
        payload={},
    )

    summary = server._admin_user_summary(tester)
    data = server._feedback_report_to_dict(event, tester=summary)

    assert data["tester"]["id"] == "user-1"
    assert data["tester"]["username"] == "tester_one"
    assert data["tester"]["email"] == "tester@example.com"
    assert data["tester"]["language_preference"] == "zh"
    assert data["tester"]["created_at"] == "2026-06-20T08:00:00"
    assert data["tester"]["last_login_at"] == "2026-06-20T09:00:00"
    assert "hashed_password" not in data["tester"]
