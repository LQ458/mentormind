"""
Course-aware diagnostic strategy for study-plan chat.

The goal is to keep the first conversation natural while still collecting the
minimum information that materially changes a production-quality plan.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from core.agents.subject_detector import SubjectDetection, _get_catalog


@dataclass(frozen=True)
class DiagnosticQuestion:
    key: str
    content_en: str
    content_zh: str
    options_en: List[str]
    options_zh: List[str]
    source: str

    def content(self, language: str) -> str:
        return self.content_zh if language == "zh" else self.content_en

    def options(self, language: str) -> List[str]:
        return self.options_zh if language == "zh" else self.options_en


HUMANITIES_SUBJECTS = {"history", "english", "economics", "government", "psychology", "world_languages", "art"}
STEM_SUBJECTS = {"math", "physics", "chemistry", "biology", "cs", "environmental_science"}


def _joined_user_text(history: List[Dict[str, str]]) -> str:
    return " ".join(m.get("content", "") for m in history if m.get("role") == "user")


def has_timeline_signal(text: str) -> bool:
    t = text.lower()
    if any(
        token in t
        for token in [
            "exam", "test", "deadline", "before", " by ", "may", "june",
            "july", "august", "september", "october", "november", "december",
            "week", "weeks", "month", "months", "not sure", "unsure", "unknown", "no idea",
            "考试", "截止", "考前", "之前", "几号", "时间", "还不确定", "不确定", "不知道",
            "周内", "周后", "个月", "月内", "月后", "以上",
        ]
    ):
        return True
    return bool(re.search(r"\d+\s*[-到至~]?\s*\d*\s*(周|星期|个月|月|weeks?|months?)", t))


def has_level_signal(text: str) -> bool:
    t = text.lower()
    return any(
        token in t
        for token in [
            "beginner", "intermediate", "advanced", "weak", "strong", "score",
            "target", "foundation", "average", "top score",
            "基础", "零基础", "初学", "一般", "中等", "熟悉", "薄弱", "目标", "分数", "目标分",
            "基础薄弱", "中等水平", "基础较好", "冲高分", "高分",
        ]
    )


def _has_focus_signal(text: str, detection: SubjectDetection) -> bool:
    t = text.lower()
    if any(token in t for token in ["weak in", "weak at", "struggle with", "practice", "focus", "不会", "难点", "练", "重点"]):
        return True

    course = _course_for_detection(detection)
    if course:
        units = course.get("units", [])
        for unit in units:
            unit_text = str(unit).lower()
            compact = unit_text.replace(" ", "")
            if unit_text and (unit_text in t or compact in t.replace(" ", "")):
                return True

    component_tokens = [
        "dbq", "leq", "saq", "frq", "mcq", "essay", "source", "argument",
        "paper 1", "paper 2", "paper 3", "ia", "internal assessment",
        "coursework", "practical", "lab", "oral", "listening", "speaking",
        "选择", "大题", "作文", "阅读", "听力", "口语", "实验", "探究", "论文", "材料题",
    ]
    return any(token in t for token in component_tokens)


def _course_for_detection(detection: Optional[SubjectDetection]) -> Optional[Dict[str, Any]]:
    if not detection or not detection.framework or not detection.course_id:
        return None
    for course in _get_catalog(detection.framework).get("courses", []):
        if course.get("id") == detection.course_id:
            return course
    return None


def _sample_units(course: Optional[Dict[str, Any]], language: str, max_items: int = 4) -> List[str]:
    if not course:
        return []
    units = [str(unit) for unit in course.get("units", []) if unit][:max_items]
    if language == "zh":
        return [unit.replace(" and ", " / ") for unit in units]
    return units


def _timeline_question(course_name: str) -> DiagnosticQuestion:
    return DiagnosticQuestion(
        key="timeline",
        content_en=f"Got it. When do you need to be ready for {course_name}?",
        content_zh=f"好的，按 {course_name} 来做。你大概什么时候要准备好？",
        options_en=["Within 4 weeks", "1-3 months", "3+ months", "Not sure"],
        options_zh=["4周内", "1-3个月", "3个月以上", "还不确定"],
        source="diagnostic_timeline",
    )


def _level_question(course_name: str) -> DiagnosticQuestion:
    return DiagnosticQuestion(
        key="level",
        content_en=f"What is your current level in {course_name}, and what result are you aiming for?",
        content_zh="你现在基础怎样？目标是什么？",
        options_en=["Weak foundation", "Average", "Strong", "Top score"],
        options_zh=["基础薄弱", "中等水平", "基础较好", "冲高分"],
        source="diagnostic_level",
    )


def _math_focus_question(course_name: str, course: Optional[Dict[str, Any]], language: str) -> DiagnosticQuestion:
    units = _sample_units(course, language)
    return DiagnosticQuestion(
        key="math_focus",
        content_en=f"Which part of {course_name} should the plan protect most?",
        content_zh="哪一块最需要重点保护？",
        options_en=units[:3] + ["Mixed review"] if units else ["Concepts", "Problem solving", "Exam timing", "Mixed review"],
        options_zh=units[:3] + ["综合复习"] if units else ["概念理解", "解题训练", "考试节奏", "综合复习"],
        source="diagnostic_math_focus",
    )


def _science_focus_question(course_name: str, course: Optional[Dict[str, Any]], language: str) -> DiagnosticQuestion:
    exam = course.get("exam_format", {}) if course else {}
    has_practical = bool(exam.get("internal_assessment") or "Practical" in str(exam) or "lab" in str(exam).lower())
    return DiagnosticQuestion(
        key="science_focus",
        content_en=f"For {course_name}, where do you lose the most points?",
        content_zh="这门课你最容易在哪类题上丢分？",
        options_en=["Concepts", "Calculations", "FRQ/structured", "Lab/IA"] if has_practical else ["Concepts", "Calculations", "FRQ", "Mixed review"],
        options_zh=["概念", "计算", "大题/结构题", "实验/IA"] if has_practical else ["概念", "计算", "大题", "综合复习"],
        source="diagnostic_science_focus",
    )


def _humanities_focus_question(course_name: str, detection: SubjectDetection, course: Optional[Dict[str, Any]]) -> DiagnosticQuestion:
    exam = course.get("exam_format", {}) if course else {}
    exam_text = str(exam).lower()
    subject = detection.subject

    if "dbq" in exam_text or detection.course_id in {"ap_us_history", "ap_world_history", "ap_european_history"}:
        return DiagnosticQuestion(
            key="history_focus",
            content_en=f"For {course_name}, which exam skill needs the most work?",
            content_zh="这门课最需要补哪类考试能力？",
            options_en=["DBQ", "LEQ", "SAQ", "MCQ/source analysis"],
            options_zh=["DBQ", "LEQ", "SAQ", "选择/材料分析"],
            source="diagnostic_history_focus",
        )

    if subject == "english" or "essay" in exam_text or "poetry" in exam_text:
        return DiagnosticQuestion(
            key="english_focus",
            content_en=f"For {course_name}, what should we prioritize?",
            content_zh="这门课优先补哪一块？",
            options_en=["Close reading", "Essay structure", "Evidence/commentary", "Timed writing"],
            options_zh=["精读分析", "作文结构", "证据/评析", "限时写作"],
            source="diagnostic_english_focus",
        )

    if subject == "world_languages":
        return DiagnosticQuestion(
            key="language_focus",
            content_en=f"For {course_name}, which skill feels weakest?",
            content_zh="语言类最需要补哪项能力？",
            options_en=["Listening", "Speaking", "Reading", "Writing"],
            options_zh=["听力", "口语", "阅读", "写作"],
            source="diagnostic_language_focus",
        )

    return DiagnosticQuestion(
        key="humanities_focus",
        content_en=f"For {course_name}, where should the plan spend extra practice?",
        content_zh="这门课需要在哪类任务上多练？",
        options_en=["Core concepts", "Data/source analysis", "Essay/FRQ", "Case examples"],
        options_zh=["核心概念", "数据/材料分析", "作文/问答题", "案例例子"],
        source="diagnostic_humanities_focus",
    )


def _framework_focus_question(course_name: str, detection: SubjectDetection, course: Optional[Dict[str, Any]]) -> Optional[DiagnosticQuestion]:
    if detection.framework == "ib" and course:
        exam = course.get("exam_format", {})
        ia = exam.get("internal_assessment")
        if ia:
            return DiagnosticQuestion(
                key="ib_coursework",
                content_en=f"Should the {ia} be part of this plan too?",
                content_zh=f"要不要把 {ia} 也放进计划里？",
                options_en=["Yes, include IA", "Exam papers only", "IA is done", "Not sure"],
                options_zh=["要，包含IA", "只练考试卷", "IA已完成", "还不确定"],
                source="diagnostic_ib_coursework",
            )

    if detection.framework == "a_level" and course:
        return DiagnosticQuestion(
            key="a_level_papers",
            content_en=f"Which part of {course_name} matters most right now?",
            content_zh="现在最需要针对哪部分？",
            options_en=["AS papers", "A2 papers", "Practical/coursework", "Full A Level"],
            options_zh=["AS卷", "A2卷", "实验/课程作业", "完整A Level"],
            source="diagnostic_a_level_papers",
        )

    if detection.framework == "gaokao" and course:
        if detection.subject in STEM_SUBJECTS:
            return DiagnosticQuestion(
                key="gaokao_stem_focus",
                content_en=f"For {course_name}, which question type costs you most?",
                content_zh="高考里最需要补哪类题？",
                options_en=["Multiple choice", "Fill blanks", "Big questions", "Speed/accuracy"],
                options_zh=["选择题", "填空题", "大题", "速度/准确率"],
                source="diagnostic_gaokao_stem_focus",
            )
        return DiagnosticQuestion(
            key="gaokao_humanities_focus",
            content_en=f"For {course_name}, which task needs extra practice?",
            content_zh="高考里最需要补哪类任务？",
            options_en=["Reading", "Essay/writing", "Source analysis", "Memorization"],
            options_zh=["阅读", "作文/写作", "材料分析", "背诵记忆"],
            source="diagnostic_gaokao_humanities_focus",
        )

    return None


def next_course_diagnostic_question(
    detection: Optional[SubjectDetection],
    history: List[Dict[str, str]],
    language: str,
) -> Optional[DiagnosticQuestion]:
    if not detection or not detection.course_id:
        return None

    user_text = _joined_user_text(history)
    course = _course_for_detection(detection)
    course_name = detection.course_name or (course.get("name") if course else "this course")

    if not has_timeline_signal(user_text):
        return _timeline_question(course_name)

    if not has_level_signal(user_text):
        return _level_question(course_name)

    if _has_focus_signal(user_text, detection):
        return None

    framework_specific = _framework_focus_question(course_name, detection, course)
    if framework_specific:
        return framework_specific

    if detection.subject == "math":
        return _math_focus_question(course_name, course, language)
    if detection.subject in {"physics", "chemistry", "biology", "environmental_science"}:
        return _science_focus_question(course_name, course, language)
    if detection.subject == "cs":
        return DiagnosticQuestion(
            key="cs_focus",
            content_en=f"For {course_name}, what should the plan emphasize?",
            content_zh="这门课计划要重点练哪块？",
            options_en=["Coding practice", "Tracing/debugging", "MCQ concepts", "Project task"],
            options_zh=["代码练习", "读代码/调试", "选择概念题", "项目任务"],
            source="diagnostic_cs_focus",
        )
    if detection.subject in HUMANITIES_SUBJECTS:
        return _humanities_focus_question(course_name, detection, course)

    return None


def build_diagnostic_guidance(detection: Optional[SubjectDetection]) -> str:
    if not detection:
        return ""
    course = _course_for_detection(detection)
    if not course:
        return ""
    exam = course.get("exam_format", {})
    units = course.get("units", [])
    subject_family = "humanities" if detection.subject in HUMANITIES_SUBJECTS else "stem"
    return (
        "\n\nCOURSE-SPECIFIC DIAGNOSTIC GUIDANCE:\n"
        f"- Course: {course.get('name')}\n"
        f"- Framework: {detection.framework}; subject family: {subject_family}\n"
        f"- Official unit/sample scope: {', '.join(str(u) for u in units[:8])}\n"
        f"- Assessment components: {json_like_summary(exam)}\n"
        "- Ask about the missing information that would most change the plan. "
        "For STEM, prioritize weak concepts, calculation fluency, lab/practical/FRQ demands, and pacing. "
        "For humanities/languages, prioritize essay/source-analysis/oral/listening/reading tasks and rubric skills. "
        "For IB/A-Level/Gaokao, account for paper/component differences and coursework/internal assessment where applicable."
    )


def json_like_summary(value: Any) -> str:
    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            if isinstance(item, list):
                parts.append(f"{key}=[{len(item)} items]")
            else:
                parts.append(f"{key}={item}")
        return "; ".join(parts)
    return str(value)
