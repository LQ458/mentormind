import os
import sys


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from celery_app import _unit_content_status


def test_unit_content_status_all_success_ready():
    status, succeeded, missing = _unit_content_status(
        {"study_guide": {"sections": []}, "quiz": {"questions": []}},
        ["study_guide", "quiz"],
    )

    assert status == "ready"
    assert succeeded == ["study_guide", "quiz"]
    assert missing == []


def test_unit_content_status_partial_success_is_ready():
    status, succeeded, missing = _unit_content_status(
        {"study_guide": {"sections": []}, "quiz": None, "flashcards": None},
        ["study_guide", "quiz", "flashcards"],
    )

    assert status == "ready"
    assert succeeded == ["study_guide"]
    assert missing == ["quiz", "flashcards"]


def test_unit_content_status_no_usable_blocks_failed():
    status, succeeded, missing = _unit_content_status(
        {"study_guide": None, "quiz": None},
        ["study_guide", "quiz"],
    )

    assert status == "failed"
    assert succeeded == []
    assert missing == ["study_guide", "quiz"]


def test_unit_content_status_explicit_error_failed():
    status, succeeded, missing = _unit_content_status(
        {"error": "model timeout", "study_guide": {"sections": []}},
        ["study_guide", "quiz"],
    )

    assert status == "failed"
    assert succeeded == []
    assert missing == ["study_guide", "quiz"]
