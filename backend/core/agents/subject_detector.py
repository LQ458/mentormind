"""
Subject Detector Module - Fast keyword-based classification with LLM fallback.
Detects subject, exam framework, difficulty, and topics from free-form student input.
Supports AP course-level detection via the AP course catalog.
"""

import json
import os
from typing import Dict, List, Optional
from dataclasses import dataclass, field

from services.api_client import api_client, get_language_instruction


@dataclass
class SubjectDetection:
    subject: str          # math, physics, chemistry, biology, cs, history, english, economics, psychology, government, world_languages, environmental_science, art, general
    framework: Optional[str]   # ap, a_level, gaokao, ib, None
    difficulty: str       # beginner, intermediate, advanced
    topics: List[str]
    confidence: float     # 0.0-1.0
    course_id: Optional[str] = None      # e.g. "ap_calculus_bc"
    course_name: Optional[str] = None    # e.g. "AP Calculus BC"


def _load_ap_catalog() -> Dict:
    """Load AP course catalog from JSON file."""
    catalog_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "prompts", "subjects", "frameworks", "ap_courses.json"
    )
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"courses": []}


# Lazy-loaded AP catalog
_AP_CATALOG: Optional[Dict] = None


def _get_ap_catalog() -> Dict:
    global _AP_CATALOG
    if _AP_CATALOG is None:
        _AP_CATALOG = _load_ap_catalog()
    return _AP_CATALOG


# AP course name patterns for fast matching (lowercase)
# Maps common input patterns -> course_id
AP_COURSE_PATTERNS: Dict[str, str] = {
    "ap calc ab": "ap_calculus_ab",
    "ap calculus ab": "ap_calculus_ab",
    "ap calc bc": "ap_calculus_bc",
    "ap calculus bc": "ap_calculus_bc",
    "ap calculus": "ap_calculus_bc",  # default to BC
    "ap statistics": "ap_statistics",
    "ap stats": "ap_statistics",
    "ap physics 1": "ap_physics_1",
    "ap physics 2": "ap_physics_2",
    "ap physics c mechanics": "ap_physics_c_mechanics",
    "ap physics c mech": "ap_physics_c_mechanics",
    "ap physics c em": "ap_physics_c_em",
    "ap physics c electricity": "ap_physics_c_em",
    "ap chemistry": "ap_chemistry",
    "ap chem": "ap_chemistry",
    "ap biology": "ap_biology",
    "ap bio": "ap_biology",
    "ap environmental science": "ap_environmental_science",
    "ap env sci": "ap_environmental_science",
    "apes": "ap_environmental_science",
    "ap computer science a": "ap_cs_a",
    "ap cs a": "ap_cs_a",
    "ap compsci a": "ap_cs_a",
    "ap computer science principles": "ap_cs_principles",
    "ap csp": "ap_cs_principles",
    "ap cs principles": "ap_cs_principles",
    "ap us history": "ap_us_history",
    "ap united states history": "ap_us_history",
    "apush": "ap_us_history",
    "ap world history": "ap_world_history",
    "ap world": "ap_world_history",
    "ap european history": "ap_european_history",
    "ap euro": "ap_european_history",
    "ap english language": "ap_english_language",
    "ap english lang": "ap_english_language",
    "ap lang": "ap_english_language",
    "ap english literature": "ap_english_literature",
    "ap english lit": "ap_english_literature",
    "ap lit": "ap_english_literature",
    "ap psychology": "ap_psychology",
    "ap psych": "ap_psychology",
    "ap macroeconomics": "ap_macroeconomics",
    "ap macro": "ap_macroeconomics",
    "ap microeconomics": "ap_microeconomics",
    "ap micro": "ap_microeconomics",
    "ap economics": "ap_macroeconomics",  # default to macro
    "ap econ": "ap_macroeconomics",
    "ap us government": "ap_us_government",
    "ap gov": "ap_us_government",
    "ap government": "ap_us_government",
    "ap human geography": "ap_human_geography",
    "ap human geo": "ap_human_geography",
    "aphug": "ap_human_geography",
    "ap spanish": "ap_spanish_language",
    "ap spanish language": "ap_spanish_language",
}


def _detect_ap_course(text_lower: str) -> Optional[Dict]:
    """Try to match input to a specific AP course. Returns course dict or None."""
    # Try exact pattern matches (longest first for greedy matching)
    sorted_patterns = sorted(AP_COURSE_PATTERNS.keys(), key=len, reverse=True)
    for pattern in sorted_patterns:
        if pattern in text_lower:
            course_id = AP_COURSE_PATTERNS[pattern]
            catalog = _get_ap_catalog()
            for course in catalog.get("courses", []):
                if course["id"] == course_id:
                    return course
    return None


# Keywords per subject — EN and ZH mixed, all lowercase for matching
SUBJECT_KEYWORDS: Dict[str, List[str]] = {
    "math": [
        "calculus", "algebra", "geometry", "trigonometry", "statistics",
        "derivatives", "integrals", "linear algebra",
        "微积分", "代数", "几何", "三角函数", "统计", "导数", "积分",
    ],
    "physics": [
        "mechanics", "thermodynamics", "electromagnetism", "optics", "waves",
        "quantum", "kinematics",
        "力学", "热力学", "电磁", "光学", "波动", "量子", "运动学",
    ],
    "chemistry": [
        "organic", "inorganic", "reactions", "bonds", "moles", "stoichiometry",
        "electrochemistry",
        "有机", "无机", "反应", "化学键", "摩尔", "化学计量", "电化学",
    ],
    "biology": [
        "cells", "genetics", "evolution", "ecology", "dna", "proteins", "mitosis",
        "细胞", "遗传", "进化", "生态", "蛋白质", "有丝分裂",
    ],
    "cs": [
        "algorithm", "data structure", "programming", "recursion", "sorting", "oop",
        "算法", "数据结构", "编程", "递归", "排序",
    ],
    "history": [
        "history", "war", "revolution", "civilization", "empire", "colonial",
        "dynasty", "treaty", "independence", "constitution",
        "历史", "战争", "革命", "文明", "帝国", "殖民", "王朝", "条约",
    ],
    "english": [
        "rhetoric", "essay", "literary", "composition", "poetry", "prose",
        "novel", "author", "thesis", "argument",
        "修辞", "文学", "作文", "诗歌", "散文", "小说",
    ],
    "economics": [
        "economics", "supply", "demand", "gdp", "inflation", "fiscal",
        "monetary", "market", "trade", "microeconomics", "macroeconomics",
        "经济", "供给", "需求", "通货膨胀", "财政", "货币", "市场",
    ],
    "psychology": [
        "psychology", "behavior", "cognitive", "neuroscience", "perception",
        "memory", "personality", "disorder", "therapy",
        "心理", "行为", "认知", "神经", "感知", "记忆", "人格",
    ],
    "government": [
        "government", "politics", "democracy", "congress", "legislation",
        "judiciary", "executive", "civil rights", "constitution",
        "政府", "政治", "民主", "国会", "立法", "司法", "行政",
    ],
    "world_languages": [
        "spanish", "french", "chinese language", "japanese language",
        "german", "latin", "language and culture",
        "西班牙语", "法语", "德语", "拉丁语",
    ],
    "environmental_science": [
        "environmental", "ecosystem", "pollution", "biodiversity", "climate",
        "sustainability", "conservation", "habitat",
        "环境", "生态系统", "污染", "生物多样性", "气候", "可持续",
    ],
    "art": [
        "art history", "studio art", "drawing", "painting", "sculpture",
        "visual art", "design", "art movement",
        "艺术", "绘画", "雕塑", "设计", "美术",
    ],
}

# Framework keywords — lowercase for matching
FRAMEWORK_KEYWORDS: Dict[str, List[str]] = {
    "ap": ["ap ", "ap考试", "advanced placement", "college board"],
    "a_level": ["a level", "a-level", "cambridge", "edexcel", "ocr", "cie"],
    "gaokao": ["gaokao", "高考", "全国卷", "高三", "高中"],
    "ib": ["ib ", "international baccalaureate"],
}


def _detect_framework(text_lower: str) -> Optional[str]:
    """Return the first matching framework key, or None."""
    for framework, keywords in FRAMEWORK_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return framework
    return None


def _detect_subject_scores(text_lower: str) -> Dict[str, int]:
    """Return hit counts per subject."""
    scores: Dict[str, int] = {}
    for subject, keywords in SUBJECT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text_lower)
        if hits:
            scores[subject] = hits
    return scores


def _infer_difficulty(text_lower: str) -> str:
    """Heuristic difficulty from signal words."""
    advanced_signals = [
        "advanced", "hard", "difficult", "complex", "graduate", "university",
        "高难度", "竞赛", "高考", "university", "college",
    ]
    beginner_signals = [
        "beginner", "basic", "intro", "introduction", "start", "新手", "入门", "基础",
    ]
    if any(s in text_lower for s in advanced_signals):
        return "advanced"
    if any(s in text_lower for s in beginner_signals):
        return "beginner"
    return "intermediate"


def _extract_topics(text_lower: str, subject: str) -> List[str]:
    """Return the matched keywords for the detected subject as topic hints."""
    keywords = SUBJECT_KEYWORDS.get(subject, [])
    return [kw for kw in keywords if kw in text_lower][:5]


class SubjectDetector:
    """Detects subject and exam framework from student free-form input."""

    def detect_fast(self, text: str) -> Optional[SubjectDetection]:
        """
        Keyword-based detection — no API call.
        Tries AP course-level match first, then falls back to general keyword matching.
        Returns None if best confidence < 0.6.
        """
        text_lower = text.lower()

        # Priority: try AP course-level detection first
        ap_course = _detect_ap_course(text_lower)
        if ap_course:
            return SubjectDetection(
                subject=ap_course["subject"],
                framework="ap",
                difficulty="intermediate",
                topics=ap_course["units"][:5],
                confidence=0.95,
                course_id=ap_course["id"],
                course_name=ap_course["name"],
            )

        scores = _detect_subject_scores(text_lower)

        if not scores:
            return None

        best_subject = max(scores, key=lambda s: scores[s])
        total_hits = sum(scores.values())
        best_hits = scores[best_subject]
        confidence = best_hits / max(total_hits, 1)

        # Normalize: more hits in one subject → higher confidence
        if best_hits >= 3:
            confidence = min(0.95, 0.6 + (best_hits - 3) * 0.05)
        elif best_hits == 2:
            confidence = 0.75
        elif best_hits == 1 and len(scores) == 1:
            confidence = 0.65
        else:
            confidence = 0.5  # tied hits — ambiguous

        if confidence < 0.6:
            return None

        framework = _detect_framework(text_lower)
        difficulty = _infer_difficulty(text_lower)
        topics = _extract_topics(text_lower, best_subject)

        return SubjectDetection(
            subject=best_subject,
            framework=framework,
            difficulty=difficulty,
            topics=topics,
            confidence=confidence,
        )

    async def detect(self, text: str, language: str = "en") -> SubjectDetection:
        """
        Try fast path first. Fall back to DeepSeek for ambiguous input.
        """
        fast_result = self.detect_fast(text)
        if fast_result is not None:
            return fast_result

        return await self._detect_via_llm(text, language)

    async def _detect_via_llm(self, text: str, language: str) -> SubjectDetection:
        """LLM fallback — classification at temperature 0.1."""
        lang_instruction = get_language_instruction(language)

        # Build valid AP course list for LLM context
        catalog = _get_ap_catalog()
        ap_course_names = [c["name"] for c in catalog.get("courses", [])]
        ap_courses_str = ", ".join(ap_course_names[:10]) + "..."

        system_prompt = (
            "You are a subject classifier for an educational platform. "
            "Given student input, return a JSON object with these exact keys: "
            'subject (one of: math, physics, chemistry, biology, cs, history, english, economics, psychology, government, world_languages, environmental_science, art, general), '
            'framework (one of: ap, a_level, gaokao, ib, or null), '
            'difficulty (one of: beginner, intermediate, advanced), '
            'topics (list of specific topic strings), '
            f'course_name (official AP course name if applicable, e.g. {ap_courses_str}, or null). '
            "Return ONLY valid JSON, no explanation."
        )

        user_prompt = f'{lang_instruction}\n\nStudent input: "{text}"'

        response = await api_client.deepseek.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=300,
        )

        raw = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")

        try:
            # Strip markdown fences if present
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            parsed = json.loads(raw)

            # Try to resolve course_name to course_id from catalog
            course_name = parsed.get("course_name")
            course_id = None
            if course_name:
                for course in catalog.get("courses", []):
                    if course["name"].lower() == course_name.lower():
                        course_id = course["id"]
                        course_name = course["name"]
                        break

            return SubjectDetection(
                subject=parsed.get("subject", "general"),
                framework=parsed.get("framework") or None,
                difficulty=parsed.get("difficulty", "intermediate"),
                topics=parsed.get("topics", []),
                confidence=0.85,
                course_id=course_id,
                course_name=course_name,
            )
        except Exception:
            # Graceful degradation: return a safe default
            return SubjectDetection(
                subject="general",
                framework=None,
                difficulty="intermediate",
                topics=[],
                confidence=0.3,
            )
