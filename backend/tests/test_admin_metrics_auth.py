import asyncio
import os
import sys
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
