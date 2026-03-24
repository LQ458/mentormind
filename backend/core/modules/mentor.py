"""
Mentor Agent Module - The "Compassionate Mentor"
Implements a 5-stage diagnostic and collaborative lesson planning flow.
"""

import json
import re
from typing import Dict, List, Optional, Tuple, Any
from enum import Enum
from dataclasses import dataclass
from datetime import datetime

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

class MentorAgent:
    """Manages the conversational stages before lesson generation."""
    
    def __init__(self):
        self.model_config = config.get_models()["deepseek_r1"]
    
    async def get_next_response(
        self, 
        history: List[Dict[str, str]], 
        current_stage: MentorStage,
        language: str = "en"
    ) -> MentorResponse:
        """Determines the next move in the mentor conversation."""
        
        lang_instruction = get_language_instruction(language)
        
        if current_stage == MentorStage.OPENING:
            return await self._handle_opening(history, language, lang_instruction)
        elif current_stage == MentorStage.DIAGNOSTIC:
            return await self._handle_diagnostic(history, language, lang_instruction)
        elif current_stage == MentorStage.ROADMAP:
            return await self._handle_roadmap(history, language, lang_instruction)
        elif current_stage == MentorStage.CO_CREATION:
            return await self._handle_co_creation(history, language, lang_instruction)
        
        return MentorResponse(stage=MentorStage.OPENING, content="Ready to start?")

    async def _handle_opening(self, history: List[Dict[str, str]], language: str, lang_instr: str) -> MentorResponse:
        """Stage 1: The Opening Hook."""
        # If the student has already provided a topic in the last message, move to diagnostic
        if history and history[-1]["role"] == "user":
            return await self._handle_diagnostic(history, language, lang_instr)
            
        content = (
            "Hey there! Ready to tackle something new today? Tell me what concept is giving you a hard time or what exam goal you are chasing right now." 
            if language == "en" else 
            "嘿！准备好今天一起攻克新知识了吗？告诉我哪个概念让你头疼，或者你正在冲刺什么考试目标。"
        )
        return MentorResponse(stage=MentorStage.OPENING, content=content)

    async def _handle_diagnostic(self, history: List[Dict[str, str]], language: str, lang_instr: str) -> MentorResponse:
        """Stage 2: The Diagnostic Check."""
        student_input = history[-1]["content"] if history else ""
        
        prompt = f"""
        You are a compassionate, expert mentor. The student just mentioned: "{student_input}"
        
        Your task:
        1. Briefly acknowledge their topic with a relatable analogy or "hook".
        2. Ask ONE "Pulse Check" diagnostic question to see where they actually stand. 
           - The question should help you decide if you should start from absolute basics or jump into advanced applications.
           - Frame it as: "Before I build your visual guide, quick question: [Diagnostic Question]?"
        
        {lang_instr}
        Keep it casual, encouraging, and focused on finding their "Zone of Proximal Development".
        Do NOT generate a lesson plan yet.
        """
        
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        
        content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        return MentorResponse(
            stage=MentorStage.DIAGNOSTIC,
            content=content,
            diagnostic_question=content
        )

    async def _handle_roadmap(self, history: List[Dict[str, str]], language: str, lang_instr: str) -> MentorResponse:
        """Stage 3: The Transparent Reveal."""
        # Find the topic and the diagnostic answer
        # history might have multiple turns now. Let's find the first user message as topic.
        user_messages = [m for m in history if m["role"] == "user"]
        topic = user_messages[0]["content"] if user_messages else "Topic"
        diagnostic_answer = user_messages[-1]["content"] if len(user_messages) > 1 else ""
        
        prompt = f"""
        You are a compassionate, expert mentor. 
        Student Topic: {topic}
        Student's Level/Diagnostic Answer: {diagnostic_answer}
        
        Your task:
        1. Reveal your "Thinking Process" in a very friendly, mentor-like way. Explain *why* you chose this specific path for them based on their pulse check.
        2. Propose a SINGLE roadmap (syllabus) for a high-quality visual lesson.
        
        The roadmap should have 4-6 chapters. Each chapter needs:
        - title: Short and concrete (e.g., "The Weightlifting Analogy", "Visualizing the Derivative")
        - visual: A micro-teaser of what will be shown (e.g., "Manim animation of gears", "Interactive graph of area")
        - goal: What the student will master in this chapter
        
        Output format:
        [Friendly Thinking Process Explanation...]
        
        ```json
        {{
            "title": "A custom title for the lesson",
            "chapters": [
                {{"title": "...", "visual": "...", "goal": "..."}},
                ...
            ]
        }}
        ```
        
        {lang_instr}
        """
        
        response = await api_client.deepseek.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4
        )
        
        full_content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        # Extract thinking process and JSON
        thinking_process = ""
        proposed_syllabus = None
        
        if "```json" in full_content:
            parts = full_content.split("```json")
            thinking_process = parts[0].strip()
            json_str = parts[1].split("```")[0].strip()
            try:
                proposed_syllabus = json.loads(json_str)
            except:
                proposed_syllabus = None
        elif "```" in full_content:
            parts = full_content.split("```")
            thinking_process = parts[0].strip()
            json_str = parts[1].strip()
            try:
                proposed_syllabus = json.loads(json_str)
            except:
                proposed_syllabus = None
        else:
            thinking_process = full_content
            
        return MentorResponse(
            stage=MentorStage.ROADMAP,
            content=(
                "Got it. Based on our chat, I've designed a personalized roadmap for you. Check it out below!" 
                if language == "en" else 
                "明白了。根据我们的交流，我为你定制了一份专属学习路线。看看下面的方案吧！"
            ),
            thinking_process=thinking_process,
            proposed_syllabus=proposed_syllabus,
            next_action_label="Looks good, let's go!" if language == "en" else "看起来不错，开始吧！"
        )

    async def _handle_co_creation(self, history: List[Dict[str, str]], language: str, lang_instr: str) -> MentorResponse:
        """Stage 4: The Co-Creation Tweak."""
        # Student might have asked for a change or said "let's go"
        last_input = history[-1]["content"].lower()
        
        if any(word in last_input for word in ["go", "start", "yes", "ok", "开始", "好", "可以"]):
            return MentorResponse(stage=MentorStage.LOCKED, content="Updating the roadmap now. Hang tight while I render your custom mentor session.")
            
        # Handle a tweak request
        # Similar to roadmap but with history context
        return await self._handle_roadmap(history, language, lang_instr)
