import asyncio
import os
import sys

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


@pytest.mark.parametrize(
    "job_id",
    [
        "550e8400-e29b-41d4-a716-446655440000",
        "job_20260621_120000",
        "asr_20260621_120000_ab12cd34",
        "task.group:child-1",
    ],
)
def test_validate_job_id_accepts_expected_task_ids(job_id):
    assert server._validate_job_id(f" {job_id} ") == job_id


@pytest.mark.parametrize(
    "job_id",
    [
        "",
        "../secret",
        "job/../secret",
        "bad job id",
        "<script>alert(1)</script>",
        "x" * 129,
    ],
)
def test_validate_job_id_rejects_unsafe_task_ids(job_id):
    with pytest.raises(HTTPException) as exc:
        server._validate_job_id(job_id)

    assert exc.value.status_code == 400


def test_job_status_rejects_invalid_id_before_backend_lookup():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.get_job_status("../secret", current_user=object()))

    assert exc.value.status_code == 400


def test_job_stream_rejects_invalid_id_before_streaming():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.stream_job_status("bad job id", current_user=object()))

    assert exc.value.status_code == 400
