import pytest
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from server import _fallback_seminar_intervention, _generate_seminar_review, _seminar_match_for_room


def test_fallback_seminar_intervention_scores_all_dimensions():
    room = {
        "topic": "Is acceleration always caused by a net force?",
        "turns": [
            {
                "kind": "human",
                "participant_name": "Ada",
                "message": "Acceleration changes when force changes.",
            }
        ],
    }

    result = _fallback_seminar_intervention(room, "Acceleration changes when force changes.", "en")

    assert result["facilitator"]["name"] == "Mina"
    assert result["ai_participant"]["name"] == "Kai"
    assert set(result["scores"]) == {
        "argument_logic",
        "concept_use",
        "responsiveness",
        "evidence",
        "collaboration",
    }


@pytest.mark.asyncio
async def test_generate_seminar_review_aggregates_player_scores():
    room = {
        "language": "en",
        "turns": [
            {
                "kind": "human",
                "participant_id": "u1",
                "participant_name": "Ada",
                "message": "Claim one",
                "scores": {
                    "argument_logic": 0.8,
                    "concept_use": 0.6,
                    "responsiveness": 0.7,
                    "evidence": 0.5,
                    "collaboration": 0.9,
                },
            },
            {
                "kind": "human",
                "participant_id": "u1",
                "participant_name": "Ada",
                "message": "Claim two",
                "scores": {
                    "argument_logic": 0.6,
                    "concept_use": 0.8,
                    "responsiveness": 0.7,
                    "evidence": 0.7,
                    "collaboration": 0.7,
                },
            },
        ],
    }

    review = await _generate_seminar_review(room)

    assert review["player_scores"][0]["name"] == "Ada"
    assert review["player_scores"][0]["turns"] == 2
    assert review["player_scores"][0]["overall"] == pytest.approx(0.7)


def test_seminar_match_prefers_same_subject_and_framework():
    room = SimpleNamespace(plan_id=None, subject="physics", framework="ap")
    plans = [
        SimpleNamespace(id="plan-1", subject="biology", framework="ap"),
        SimpleNamespace(id="plan-2", subject="physics", framework="ap"),
    ]

    match = _seminar_match_for_room(room, plans)

    assert match["score"] > 0.5
    assert "same_subject" in match["reasons"]
    assert "same_framework" in match["reasons"]
