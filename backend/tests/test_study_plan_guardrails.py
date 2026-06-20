import os
import sys

import pytest
from fastapi import HTTPException


HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

import server


def _unit(title="Limits and Continuity"):
    return {
        "title": title,
        "description": "Core ideas and practice.",
        "topics": ["limits"],
        "learning_objectives": ["Understand the definition of a limit"],
        "estimated_minutes": 45,
    }


def test_rejects_empty_study_plan_units():
    with pytest.raises(HTTPException) as exc_info:
        server._normalize_study_plan_payload(
            {"framework": "ap", "subject": "math", "units": []},
            "en",
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["error"] == "empty_study_plan"


def test_rejects_gaokao_content_inside_ap_plan():
    with pytest.raises(HTTPException) as exc_info:
        server._normalize_study_plan_payload(
            {
                "framework": "ap",
                "subject": "math",
                "title": "AP Calculus BC 130+ 高考冲刺计划",
                "units": [_unit()],
            },
            "zh",
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["error"] == "framework_conflict"
    assert exc_info.value.detail["framework"] == "ap"


def test_rejects_ap_content_inside_gaokao_plan():
    with pytest.raises(HTTPException) as exc_info:
        server._normalize_study_plan_payload(
            {
                "framework": "gaokao",
                "subject": "math",
                "course_name": "Advanced Placement Calculus",
                "units": [_unit("导数与函数")],
            },
            "zh",
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["error"] == "framework_conflict"
    assert exc_info.value.detail["framework"] == "gaokao"


def test_accepts_matching_plan_and_normalizes_units():
    payload, units = server._normalize_study_plan_payload(
        {
            "framework": "ap",
            "subject": "MATH",
            "title": "AP Calculus BC",
            "diagnostic_context": None,
            "units": [
                {
                    "title": "  Limits and Continuity  ",
                    "description": "x" * 5000,
                    "topics": "limits",
                    "learning_objectives": None,
                    "estimated_minutes": 5,
                }
            ],
        },
        "en",
    )

    assert payload["framework"] == "ap"
    assert payload["subject"] == "math"
    assert payload["language"] == "en"
    assert payload["diagnostic_context"] == {}
    assert len(units) == 1
    assert units[0]["title"] == "Limits and Continuity"
    assert units[0]["topics"] == []
    assert units[0]["learning_objectives"] == []
    assert units[0]["estimated_minutes"] == 15
    assert len(units[0]["description"]) == 4000
