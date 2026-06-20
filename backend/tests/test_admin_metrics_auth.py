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


@pytest.mark.parametrize(
    "invoke",
    [
        lambda user: server.get_ops_queue_depths(current_user=user),
        lambda user: server.get_performance_metrics(current_user=user),
        lambda user: server.get_lesson_generation_metrics(current_user=user),
        lambda user: server.get_content_quality_analytics(current_user=user),
        lambda user: server.get_lesson_quality("lesson-1", current_user=user),
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
