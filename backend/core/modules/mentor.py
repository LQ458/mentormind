"""
Mentor Agent Module - The "Compassionate Mentor"
Implements a streamlined diagnostic → roadmap flow.
Max 2 diagnostic questions before auto-advancing to roadmap.
Recognizes intent signals like "just start" / "generate" and skips straight to generation.
"""

import json
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass

from config import config
from services.api_client import api_client, get_language_instruction

class MentorStage(Enum):
    OPENING = "opening"
    DIAGNOSTIC = "diagnostic"
    ROADMAP = "roadmap"
    CO_CREATION = "co_creation"
    LOCKED = "locked"

@dataclass
class MentorResponse:
    stage: MentorStage
    content: str
    thinking_process: Optional[str] = None
    proposed_syllabus: Optional[Dict[str, Any]] = None
    diagnostic_question: Optional[str] = None
    next_action_label: Optional[str] = None
    preferred_voice: Optional[str] = None

# Phrases that mean "stop asking and just generate"
_START_SIGNALS = [
    "just start", "start generating", "start", "generate", "go", "begin",
    "lets go", "let's go", "just do it", "proceed", "continue", "enough",
    "stop asking", "just make it", "create it", "create lesson",
    "开始", "生成", "直接", "好了", "可以了", "开始生成",
]

def _wants_to_start(text: str) -> bool:
    t = text.lower().strip()
    return any(signal in t for signal in _START_SIGNALS)

def _count_diagnostic_turns(history: List[Dict[str, str]]) -> int:
    """Count how many times the assistant already asked a diagnostic question."""
    return sum(1 for m in history if m["role"] == "assistant")

class MentorAgent:
    """Manages the conversational stages before lesson generation."""

    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]

    async def get_next_response(
        self,
        history: List[Dict[str, str]],
        current_stage: MentorStage,
        language: str = "en"
    ) -> MentorResponse:
        """Determines the next move in the mentor conversation."""

        lang_instruction = get_language_instruction(language)
        last_user = history[-1]["content"] if history and history[-1]["role"] == "user" else ""

        # If user says "just start" at any stage → go straight to roadmap then lock
        if current_stage != MentorStage.OPENING and _wants_to_start(last_user):
            return await self._handle_roadmap(history, language, lang_instruction, fast=True)

        if current_stage == MentorStage.OPENING:
            return await self._handle_opening(history, language, lang_instruction)
        elif current_stage == MentorStage.DIAGNOSTIC:
            return await self._handle_diagnostic(history, language, lang_instruction)
        elif current_stage == MentorStage.ROADMAP:
            return await self._handle_roadmap(history, language, lang_instruction)
        elif current_stage == MentorStage.CO_CREATION:
            return await self._handle_co_creation(history, language, lang_instruction)

        return MentorResponse(stage=MentorStage.OPENING, content="Ready to start?")

    async def _handle_opening(self, history, language, lang_instr) -> MentorResponse:
        """Stage 1: The Opening Hook."""
        if history and history[-1]["role"] == "user":
            return await self._handle_diagnostic(history, language, lang_instr)

        content = (
            "Hey! Tell me what concept is giving you a hard time, or what topic you want to master today."
            if language == "en" else
            "嘿！告诉我哪个概念让你头疼，或者你今天想攻克什么主题？"
        )
        return MentorResponse(stage=MentorStage.OPENING, content=content)

    async def _handle_diagnostic(self, history, language, lang_instr) -> MentorResponse:
        """Stage 2: Diagnostic — max 2 questions, then auto-advance."""
        diagnostic_turns = _count_diagnostic_turns(history)

        # After 2 assistant turns in diagnostic, stop asking and build the roadmap
        if diagnostic_turns >= 2:
            return await self._handle_roadmap(history, language, lang_instr, fast=True)

        student_input = history[-1]["content"] if history else ""
        turn_hint = (
            "This is your FIRST and likely ONLY diagnostic question. Make it count."
            if diagnostic_turns == 0 else
            "This is your LAST allowed question before you must build the roadmap. Ask something that captures their level and preferred style in one shot."
        )

        prompt = f"""{lang_instr}

You are a concise, expert mentor. The student said: "{student_input}"

{turn_hint}

Your task:
1. Acknowledge their topic in ONE short sentence with an analogy or encouraging hook.
2. Ask exactly ONE sharp diagnostic question to gauge their level. 
   - Do NOT use the phrase "Before I build your visual guide".
   - Do NOT ask multiple questions.
   - Do NOT repeat earlier questions from the conversation.

Keep it conversational and brief (3-5 sentences total). Do NOT generate a lesson plan yet.
"""
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6
        )
        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return MentorResponse(stage=MentorStage.DIAGNOSTIC, content=content, diagnostic_question=content)

    async def _handle_roadmap(self, history, language, lang_instr, fast: bool = False) -> MentorResponse:
        """Stage 3: Build and reveal the lesson roadmap."""
        user_messages = [m for m in history if m["role"] == "user"]
        topic = user_messages[0]["content"] if user_messages else "the topic"
        diagnostic_summary = " | ".join(m["content"] for m in user_messages[1:]) if len(user_messages) > 1 else "Not much diagnostic info — use sensible defaults."

        fast_note = "The student said 'just start' — skip the lengthy preamble. One sentence of acknowledgement, then the JSON." if fast else ""

        prompt = f"""{lang_instr}

You are a compassionate expert mentor.
Student topic: {topic}
Diagnostic answers: {diagnostic_summary}
{fast_note}

Your task:
1. In 1-3 sentences, briefly explain what level/path you chose for them and why — friendly and encouraging, NOT lengthy.
2. Suggest a voice: choose ONE from: "alex" (warm male), "anna" (energetic female), "lucy" (calm female), "michael" (authoritative male).
3. Propose a lesson roadmap with 4-6 chapters.

Output format — text first, then the JSON block:

[1-3 sentence explanation here]

```json
{{
    "title": "Short plain topic title (≤5 words, NO colons or subtitles, e.g. 'Introduction to Derivatives')",
    "voice_preference": "anna",
    "chapters": [
        {{"title": "...", "visual": "...", "goal": "..."}},
        ...
    ]
}}
```
"""
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4
        )
        full_content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")

        thinking_process = ""
        proposed_syllabus = None
        preferred_voice = "anna"

        if "```json" in full_content:
            parts = full_content.split("```json")
            thinking_process = parts[0].strip()
            json_str = parts[1].split("```")[0].strip()
            try:
                proposed_syllabus = json.loads(json_str)
                preferred_voice = proposed_syllabus.get("voice_preference", "anna")
            except Exception:
                proposed_syllabus = None
        elif "```" in full_content:
            parts = full_content.split("```")
            thinking_process = parts[0].strip()
            try:
                proposed_syllabus = json.loads(parts[1].strip())
                preferred_voice = proposed_syllabus.get("voice_preference", "anna")
            except Exception:
                proposed_syllabus = None
        else:
            thinking_process = full_content

        summary = (
            "Here's your personalized roadmap — review it and hit **Let's go!** when ready."
            if language == "en" else
            "这是你的专属学习路线——确认后点击**开始吧！**。"
        )

        return MentorResponse(
            stage=MentorStage.ROADMAP,
            content=summary,
            thinking_process=thinking_process,
            proposed_syllabus=proposed_syllabus,
            next_action_label="Looks good, let's go!" if language == "en" else "看起来不错，开始吧！",
            preferred_voice=preferred_voice
        )

    async def _handle_co_creation(self, history, language, lang_instr) -> MentorResponse:
        """Stage 4: Tweak or confirm."""
        last_input = history[-1]["content"].lower()
        if any(w in last_input for w in ["go", "start", "yes", "ok", "好", "开始", "可以", "fine", "great", "perfect", "looks good"]):
            return MentorResponse(
                stage=MentorStage.LOCKED,
                content="Perfect — generating your lesson now..." if language == "en" else "好的——正在生成你的课程……"
            )
        return await self._handle_roadmap(history, language, lang_instr)
