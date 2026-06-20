"""
Test suite for the v2 multi-framework study-plan refactor (2026-05-03).

Covers:
- Catalog parity (T1–T4): every framework's _get_catalog returns courses
- Curriculum-note builder (T5–T9): catalog injection vs. fallback prose
- Forced-zh removal (T10): output language follows the user choice
- Module-singleton state-leak fix (T11): no _cached_detection on the instance
- ask_user tool-call parser (T12–T16): JSON parsing, malformed handling, strip
- MAX_DIAGNOSTIC_TURNS cap raised from 3 → 6 (T17)
- Course pattern detection across frameworks (T18–T20)

Run from backend/ with: python -m pytest tests/test_study_plan_v2.py -q

These tests are pure-python and do not require a running backend or LLM.
"""
import os
import sys
import json
import pytest

# Ensure backend/ on path
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from core.agents.subject_detector import (
    _get_catalog,
    _detect_course,
    _get_ap_catalog,
    AP_COURSE_PATTERNS,
    GAOKAO_COURSE_PATTERNS,
    IB_COURSE_PATTERNS,
    A_LEVEL_COURSE_PATTERNS,
    SubjectDetection,
)
from core.agents import study_plan_agent as study_plan_agent_module
from core.agents.study_plan_agent import (
    StudyPlanAgent,
    PlanResponse,
    PlanStage,
    MAX_DIAGNOSTIC_TURNS,
    _has_level_signal,
    _has_timeline_signal,
    _parse_ask_user_block,
    _parse_plan_json,
    _strip_ask_user_block,
    _build_curriculum_note,
    _plan_json_language_contract,
    _build_weekly_schedule,
    _extract_requested_study_days,
)


# ── Catalog parity (T1–T4) ──────────────────────────────────────────────────

def test_T1_ap_catalog_loads():
    cat = _get_catalog("ap")
    assert "courses" in cat
    assert len(cat["courses"]) >= 5
    assert all("id" in c and "units" in c for c in cat["courses"])


def test_T2_gaokao_catalog_loads():
    cat = _get_catalog("gaokao")
    assert "courses" in cat
    assert len(cat["courses"]) >= 5
    assert any(c["id"] == "gaokao_math" for c in cat["courses"])


def test_T3_ib_catalog_loads_with_levels():
    cat = _get_catalog("ib")
    assert len(cat["courses"]) >= 5
    levels_seen = {c.get("level") for c in cat["courses"] if c.get("level")}
    assert "HL" in levels_seen, "IB catalog should declare HL courses"


def test_T4_a_level_catalog_loads():
    cat = _get_catalog("a_level")
    assert len(cat["courses"]) >= 5
    # A-Level entries embed AS/A2 markers in their unit list
    sample_units = " ".join(cat["courses"][0]["units"])
    assert "AS:" in sample_units or "A2:" in sample_units


def test_T4b_unknown_framework_returns_empty_courses():
    cat = _get_catalog("klingon")
    assert cat == {"courses": []}


# ── Curriculum-note builder (T5–T9) ─────────────────────────────────────────

def _det(framework, course_id=None, course_name=None, subject="math"):
    return SubjectDetection(
        subject=subject,
        framework=framework,
        difficulty="intermediate",
        topics=[],
        confidence=0.95,
        course_id=course_id,
        course_name=course_name,
    )


def test_T5_ap_curriculum_note_injects_catalog_units():
    note = _build_curriculum_note(_det("ap", "ap_calculus_bc", "AP Calculus BC"))
    assert "OFFICIAL AP CURRICULUM" in note
    assert "Limits and Continuity" in note  # canonical AP Calc unit


def test_T6_gaokao_curriculum_note_injects_chinese_units():
    note = _build_curriculum_note(_det("gaokao", "gaokao_math", "高考数学"))
    assert "OFFICIAL GAOKAO CURRICULUM" in note
    assert "导数" in note or "三角函数" in note


def test_T7_ib_curriculum_note_includes_papers():
    note = _build_curriculum_note(_det("ib", "ib_math_aa_hl", "IB Math AA HL"))
    assert "OFFICIAL IB CURRICULUM" in note
    # exam_format keys flatten into the "papers: ..." string
    assert "papers" in note or "paper_1_minutes" in note


def test_T8_unknown_course_falls_back_to_prose():
    note = _build_curriculum_note(_det("ap", "ap_does_not_exist", "Bogus"))
    assert "AP College Board" in note
    assert "OFFICIAL AP CURRICULUM" not in note


def test_T9_no_framework_returns_empty():
    note = _build_curriculum_note(_det(None))
    assert note == ""


# ── Forced-zh removal (T10) ──────────────────────────────────────────────────

def test_T10_no_forced_zh_for_gaokao():
    """The previous implementation forced output_language='zh' for gaokao.
    The new code respects the user-supplied language. We verify by checking
    that the build helper does not contain a hard-coded zh override path."""
    import inspect
    from core.agents import study_plan_agent
    src = inspect.getsource(study_plan_agent)
    # The dead `output_language = "zh" if ...` line must be gone
    assert 'output_language = "zh"' not in src
    # The bilingual hint helper must remain (so en+gaokao still gets terminology)
    assert "bilingual_terminology_hint" in src


def test_T10b_zh_plan_json_contract_localizes_student_fields():
    contract = _plan_json_language_contract("zh")
    assert "title" in contract
    assert "unit titles" in contract
    assert "learning_objectives" in contract
    assert "AP" in contract
    assert "周一" in contract
    assert "Do not leave descriptions or objectives as English sentences" in contract


# ── Module-singleton state-leak fix (T11) ───────────────────────────────────

def test_T11_no_cached_detection_on_instance():
    agent = StudyPlanAgent()
    assert not hasattr(agent, "_cached_detection"), \
        "StudyPlanAgent must not store per-conversation state on self (cross-user leak)"


# ── ask_user tool-call parser (T12–T16) ─────────────────────────────────────

def test_T12_parse_well_formed_ask_user_block():
    content = '''Got it.\n```ask_user\n{"question": "How many weeks before exam?", "options": ["<4","4-12",">12"], "allow_free_text": true}\n```'''
    parsed = _parse_ask_user_block(content)
    assert parsed is not None
    assert parsed["question"] == "How many weeks before exam?"
    assert parsed["options"] == ["<4", "4-12", ">12"]
    assert parsed["allow_free_text"] is True


def test_T13_parse_returns_none_when_missing():
    assert _parse_ask_user_block("just a chat reply with no block") is None


def test_T14_parse_returns_none_on_malformed_json():
    bad = "```ask_user\n{not json}\n```"
    assert _parse_ask_user_block(bad) is None


def test_T15_strip_ask_user_block():
    content = '''Hi there.\n```ask_user\n{"question": "x?"}\n```\nThanks.'''
    stripped = _strip_ask_user_block(content)
    assert "ask_user" not in stripped
    assert "Hi there." in stripped
    assert "Thanks." in stripped


def test_T16_options_optional():
    parsed = _parse_ask_user_block('```ask_user\n{"question":"q?"}\n```')
    assert parsed is not None
    assert parsed["question"] == "q?"
    assert parsed["options"] is None
    assert parsed["allow_free_text"] is True  # default


def test_T16b_invalid_options_type_drops_options():
    parsed = _parse_ask_user_block('```ask_user\n{"question":"q?","options":"not-a-list"}\n```')
    assert parsed is not None
    assert parsed["options"] is None


# ── Diagnostic turn cap raised (T17) ────────────────────────────────────────

def test_T17_max_diagnostic_turns_is_6():
    assert MAX_DIAGNOSTIC_TURNS == 6


# ── Course pattern detection across frameworks (T18–T20) ────────────────────

def test_T18_detect_gaokao_course():
    course = _detect_course("我想准备高考数学", framework=None)
    assert course is not None
    assert course["id"] == "gaokao_math"
    assert course["_framework"] == "gaokao"


def test_T19_detect_ib_course():
    course = _detect_course("ib math aa hl preparation tips", framework=None)
    assert course is not None
    assert course["id"] == "ib_math_aa_hl"
    assert course["_framework"] == "ib"


def test_T20_detect_a_level_course():
    course = _detect_course("preparing for cambridge a level physics 9702", framework=None)
    assert course is not None
    assert course["_framework"] == "a_level"
    assert course["id"] == "a_level_physics"


def test_T20b_detect_ap_still_works():
    course = _detect_course("ap calculus bc")
    assert course is not None
    assert course["_framework"] == "ap"
    assert course["id"] == "ap_calculus_bc"


def test_T20c_backwards_compat_get_ap_catalog():
    # Older code paths may import the legacy alias
    cat = _get_ap_catalog()
    assert "courses" in cat


def test_T20d_response_dataclass_has_options_field():
    r = PlanResponse(stage=PlanStage.DIAGNOSTIC, content="hi")
    assert r.response_source == "unknown"
    assert hasattr(r, "options")
    assert hasattr(r, "allow_free_text")
    assert r.allow_free_text is True
    assert r.options is None


# ── Preselected framework wiring (T21–T23) ─────────────────────────────────

import asyncio


def test_T21_get_next_response_accepts_preselected_kwargs():
    """The agent's entry point must accept preselected_subject/framework so the
    frontend's framework picker actually drives plan generation (was being
    silently dropped before 2026-05-03 fix)."""
    import inspect
    sig = inspect.signature(StudyPlanAgent.get_next_response)
    assert "preselected_subject" in sig.parameters
    assert "preselected_framework" in sig.parameters
    assert "preselected_course" in sig.parameters


def test_T22_preselected_framework_overrides_detection():
    """When the user picks Gaokao in the UI but types only 'I want to learn calculus'
    (no 'Gaokao' keyword), the agent must still treat it as gaokao."""
    agent = StudyPlanAgent()
    history = [{"role": "user", "content": "I want to learn calculus"}]
    detection = asyncio.run(
        agent._detect_for(history, "en", preselected_subject="math", preselected_framework="gaokao")
    )
    assert detection is not None
    assert detection.framework == "gaokao", f"expected gaokao, got {detection.framework}"
    assert detection.subject == "math"


def test_T23_preselected_clears_stale_ap_course_id():
    """If detection latches onto 'AP Calculus' but the user picked IB framework,
    the AP course_id must be cleared so the curriculum-note builder doesn't
    inject AP units into an IB plan."""
    agent = StudyPlanAgent()
    history = [{"role": "user", "content": "I want AP Calculus BC"}]
    detection = asyncio.run(
        agent._detect_for(history, "en", preselected_subject="math", preselected_framework="ib")
    )
    assert detection is not None
    assert detection.framework == "ib"
    # Either it found a matching IB course or cleared the AP one entirely
    if detection.course_id:
        assert detection.course_id.startswith("ib_"), \
            f"AP course_id leaked into IB plan: {detection.course_id}"
    # Curriculum note should be IB-flavoured, not AP
    note = _build_curriculum_note(detection)
    assert "OFFICIAL AP CURRICULUM" not in note


def test_T23b_preselected_course_overrides_conflicting_free_text():
    """The exact course chip should anchor catalog selection even when the
    student's free text includes conflicting score jargon from another system."""
    agent = StudyPlanAgent()
    history = [{"role": "user", "content": "I need a 130+ plan and keep mentioning 高考 by mistake"}]
    detection = asyncio.run(
        agent._detect_for(
            history,
            "en",
            preselected_subject="math",
            preselected_framework="ap",
            preselected_course="AP Calculus BC",
        )
    )
    assert detection is not None
    assert detection.framework == "ap"
    assert detection.subject == "math"
    assert detection.course_id == "ap_calculus_bc"
    assert detection.course_name == "AP Calculus BC"


def test_T24_preselected_ap_chip_flow_marks_deterministic_sources():
    agent = StudyPlanAgent()
    history = [{"role": "user", "content": "数学 AP (美国大学预修)"}]

    course = asyncio.run(
        agent.get_next_response(history, PlanStage.DIAGNOSTIC, "zh", "math", "ap")
    )
    assert course.response_source == "deterministic_course_options"
    assert course.options == ["微积分AB", "微积分BC", "统计学"]

    history += [
        {"role": "assistant", "content": course.content},
        {"role": "user", "content": "微积分BC"},
    ]
    timeline = asyncio.run(
        agent.get_next_response(history, PlanStage.DIAGNOSTIC, "zh", "math", "ap")
    )
    assert timeline.response_source == "diagnostic_timeline"
    assert "什么时候" in timeline.content or "准备好" in timeline.content


@pytest.mark.parametrize("text", ["4周内", "1-3个月", "3个月以上", "within 4 weeks", "1-3 months"])
def test_T25_timeline_chip_labels_are_detected(text):
    assert _has_timeline_signal(text)


@pytest.mark.parametrize("text", ["基础薄弱", "中等水平", "基础较好", "冲高分", "top score"])
def test_T26_level_chip_labels_are_detected(text):
    assert _has_level_signal(text)


def test_T27_ap_history_asks_source_skill_after_core_info():
    agent = StudyPlanAgent()
    history = [
        {"role": "user", "content": "AP US History"},
        {"role": "assistant", "content": "When do you need to be ready?"},
        {"role": "user", "content": "1-3 months"},
        {"role": "assistant", "content": "What is your current level?"},
        {"role": "user", "content": "Average, aiming for 5"},
    ]
    response = asyncio.run(
        agent.get_next_response(history, PlanStage.DIAGNOSTIC, "en", "history", "ap")
    )
    assert response.response_source == "diagnostic_history_focus"
    assert response.options == ["DBQ", "LEQ", "SAQ", "MCQ/source analysis"]


def test_T28_ib_science_asks_coursework_component_after_core_info():
    agent = StudyPlanAgent()
    history = [
        {"role": "user", "content": "IB Biology HL"},
        {"role": "assistant", "content": "When do you need to be ready?"},
        {"role": "user", "content": "3+ months"},
        {"role": "assistant", "content": "What is your current level?"},
        {"role": "user", "content": "Strong, target 7"},
    ]
    response = asyncio.run(
        agent.get_next_response(history, PlanStage.DIAGNOSTIC, "en", "biology", "ib")
    )
    assert response.response_source == "diagnostic_ib_coursework"
    assert "IA" in " ".join(response.options or []) or "Internal" in response.content


def test_T29_a_level_asks_paper_focus_after_core_info():
    agent = StudyPlanAgent()
    history = [
        {"role": "user", "content": "A Level Economics 9708"},
        {"role": "assistant", "content": "When do you need to be ready?"},
        {"role": "user", "content": "within 4 weeks"},
        {"role": "assistant", "content": "What is your current level?"},
        {"role": "user", "content": "Weak foundation"},
    ]
    response = asyncio.run(
        agent.get_next_response(history, PlanStage.DIAGNOSTIC, "en", "economics", "a_level")
    )
    assert response.response_source == "diagnostic_a_level_papers"
    assert response.options == ["AS papers", "A2 papers", "Practical/coursework", "Full A Level"]


def test_T30_plan_review_timeout_returns_error_not_catalog_fallback(monkeypatch):
    agent = StudyPlanAgent()

    async def slow_completion(*args, **kwargs):
        await asyncio.sleep(0.05)
        raise AssertionError("wait_for should cancel before this completes")

    monkeypatch.setattr(study_plan_agent_module, "PLAN_REVIEW_LLM_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(study_plan_agent_module, "PLAN_REVIEW_LLM_RETRY_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(
        study_plan_agent_module.api_client,
        "study_plan_chat_completion",
        slow_completion,
    )

    response = asyncio.run(
        agent.get_next_response(
            [
                {"role": "user", "content": "AP US History"},
                {"role": "assistant", "content": "When do you need to be ready?"},
                {"role": "user", "content": "1-3 months"},
                {"role": "assistant", "content": "What is your current level?"},
                {"role": "user", "content": "generate"},
            ],
            PlanStage.DIAGNOSTIC,
            "en",
            "history",
            "ap",
        )
    )

    assert response.stage == PlanStage.DIAGNOSTIC
    assert response.proposed_plan is None
    assert response.response_source == "llm_plan_review_timeout_after_retry_fast"
    assert "did not finish" in response.content


def test_T31_plan_review_retries_with_compact_prompt_after_timeout(monkeypatch):
    agent = StudyPlanAgent()
    calls = {"count": 0}

    class DummyResponse:
        success = True
        data = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "title": "AP US History Plan",
                                "subject": "history",
                                "framework": "ap",
                                "course_name": "AP United States History",
                                "estimated_hours": 40,
                                "units": [
                                    {
                                        "title": "Period 1",
                                        "description": "Early American history",
                                        "topics": ["1491-1607"],
                                        "learning_objectives": ["Explain early societies"],
                                        "estimated_minutes": 300,
                                    }
                                ],
                            }
                        )
                    }
                }
            ]
        }

    async def timeout_then_success(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            await asyncio.sleep(0.05)
            raise AssertionError("first call should be cancelled")
        return DummyResponse()

    monkeypatch.setattr(study_plan_agent_module, "PLAN_REVIEW_LLM_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(study_plan_agent_module, "PLAN_REVIEW_LLM_RETRY_TIMEOUT_SECONDS", 1)
    monkeypatch.setattr(
        study_plan_agent_module.api_client,
        "study_plan_chat_completion",
        timeout_then_success,
    )

    response = asyncio.run(
        agent.get_next_response(
            [
                {"role": "user", "content": "AP US History"},
                {"role": "assistant", "content": "When do you need to be ready?"},
                {"role": "user", "content": "1-3 months"},
                {"role": "assistant", "content": "What is your current level?"},
                {"role": "user", "content": "generate"},
            ],
            PlanStage.DIAGNOSTIC,
            "en",
            "history",
            "ap",
        )
    )

    assert calls["count"] == 2
    assert response.stage == PlanStage.PLAN_REVIEW
    assert response.response_source == "llm_plan_review_retry_fast"
    assert response.proposed_plan["title"] == "AP US History Plan"


def test_T32_plan_review_parse_error_returns_retryable_error(monkeypatch):
    agent = StudyPlanAgent()

    class DummyResponse:
        success = True
        data = {"choices": [{"message": {"content": "not json"}}]}

    async def bad_completion(*args, **kwargs):
        return DummyResponse()

    monkeypatch.setattr(
        study_plan_agent_module.api_client,
        "study_plan_chat_completion",
        bad_completion,
    )

    response = asyncio.run(
        agent.get_next_response(
            [
                {"role": "user", "content": "AP US History"},
                {"role": "assistant", "content": "When do you need to be ready?"},
                {"role": "user", "content": "1-3 months"},
                {"role": "assistant", "content": "What is your current level?"},
                {"role": "user", "content": "generate"},
            ],
            PlanStage.DIAGNOSTIC,
            "zh",
            "history",
            "ap",
        )
    )

    assert response.stage == PlanStage.DIAGNOSTIC
    assert response.proposed_plan is None
    assert response.response_source == "llm_plan_review_parse_error_after_retry_fast"
    assert "没有生成完成" in response.content


def test_T33_parse_plan_json_accepts_prose_wrapped_object():
    _, plan = _parse_plan_json(
        'Here is the plan:\n'
        '{"title":"AP Calculus BC Plan","subject":"math","framework":"ap",'
        '"estimated_hours":40,"units":[{"title":"Series","topics":["Taylor"],"estimated_minutes":300}]}\n'
        'Use this schedule.'
    )

    assert plan is not None
    assert plan["title"] == "AP Calculus BC Plan"
    assert plan["units"][0]["title"] == "Series"


def test_T34_parse_plan_json_unwraps_proposed_plan_payload():
    _, plan = _parse_plan_json(
        '```json\n'
        '{"proposed_plan":{"title":"Wrapped Plan","subject":"math","framework":"ap",'
        '"estimated_hours":20,"units":[{"title":"Polar","topics":["area"],"estimated_minutes":180}]}}\n'
        '```'
    )

    assert plan is not None
    assert plan["title"] == "Wrapped Plan"
    assert plan["units"][0]["title"] == "Polar"


def test_T35_extract_requested_study_days_from_intake_summary():
    days = _extract_requested_study_days(
        "Schedule: Mon, Wed, Fri, Sun, 2 hours per session",
        "en",
    )

    assert days == ["Mon", "Wed", "Fri", "Sun"]


def test_T36_weekly_schedule_preserves_requested_days():
    schedule = _build_weekly_schedule("accelerated", "en", ["Mon", "Wed", "Fri", "Sun"])

    assert [slot["day"] for slot in schedule] == ["Mon", "Wed", "Fri", "Sun"]
    assert "hard" in schedule[0]["focus"].lower()
    assert "hard" in schedule[3]["focus"].lower()


def test_T37_extract_requested_zh_study_days_from_intake_summary():
    days = _extract_requested_study_days(
        "学习安排：周二, 周四, 周日，每次 1 小时",
        "zh",
    )

    assert days == ["周二", "周四", "周日"]
