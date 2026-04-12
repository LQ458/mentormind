"""
Create Classes Function for MentorMind
Provides English and Chinese versions for creating educational classes/lessons
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import config
try:
    from services.api_client import api_client
except ImportError:
    # For direct execution - add backend directory to path
    import sys
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.append(backend_dir)
    from services.api_client import api_client

from modules.cognitive import CognitiveProcessor
from modules.agentic import TeachingAgent, LessonPlan, QualityAssessment
from modules.output import OutputPipeline


class Language(Enum):
    CHINESE = "zh"
    ENGLISH = "en"
    JAPANESE = "ja"
    KOREAN = "ko"


@dataclass
class ClassCreationRequest:
    topic: str
    language: Language = Language.CHINESE
    student_level: str = "beginner"
    duration_minutes: int = 30
    include_video: bool = True
    include_exercises: bool = True
    include_assessment: bool = True
    custom_requirements: Optional[str] = None
    target_audience: str = "students"
    difficulty_level: str = "intermediate"
    voice_id: str = "anna"
    user_id: Optional[str] = None
    syllabus: Optional[Dict[str, Any]] = None  # Locked syllabus from mentor chat


@dataclass
class ClassCreationResult:
    success: bool
    class_title: str
    class_description: str
    learning_objectives: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)
    teaching_methodology: str = ""
    lesson_plan: LessonPlan = None
    exercises: List[str] = field(default_factory=list)
    assessment: Optional[str] = None
    resources: List[str] = field(default_factory=list)
    estimated_duration: str = ""
    difficulty_level: str = ""
    target_audience: str = ""
    customization_notes: str = ""
    ai_insights: Dict[str, Any] = field(default_factory=dict)
    language_used: Optional[Language] = None
    audio_url: Optional[str] = None
    video_url: Optional[str] = None


class ClassCreator:
    def __init__(self):
        self.cognitive_processor = CognitiveProcessor()
        self.teaching_agent = TeachingAgent()
        self.output_pipeline = OutputPipeline()
    
    async def analyze_student_query(self, query: str, language: str = "zh") -> List[Dict[str, Any]]:
        """Analyze student query and return topic suggestions using real AI with full bilingual support"""
        try:
            # Format query for English API
            english_query = await self._format_english_query(query, language)
            
            # Process the query with real AI (always process in English for better AI performance)
            result = await api_client.process_query(
                topic=english_query,
                language=Language.ENGLISH.value,
                student_level="beginner",
                format_type="analysis"
            )
            
            if result.success and result.data:
                # Convert AI response to topic format
                ai_topics = []
                
                # Handle different response formats
                if isinstance(result.data, list):
                    ai_topics = result.data
                elif isinstance(result.data, dict):
                    ai_topics = result.data.get("topics", [])
                    if not ai_topics and "raw_response" in result.data:
                        ai_topics = [{
                            "title": "AI Analysis Result",
                            "description": result.data["raw_response"][:200] + "...",
                            "confidence": 0.8,
                            "follow_up_questions": [
                                "Please explain your learning goals in detail",
                                "What specific content do you want to learn?",
                                "What is your schedule like?"
                            ]
                        }]
                
                # Generate bilingual versions for all topics
                topics = []
                for i, item in enumerate(ai_topics):
                    title = item.get("title", "")
                    description = item.get("description", "")
                    follow_up_questions = item.get("follow_up_questions", [])
                    
                    # Detect if English or Chinese
                    is_title_chinese = self._is_chinese(title)
                    is_desc_chinese = self._is_chinese(description)
                    
                    # Ensure we have both versions
                    title_en = title
                    title_zh = title
                    if is_title_chinese:
                        title_en = await api_client.translate_content(title, "en")
                    else:
                        title_zh = await api_client.translate_content(title, "zh")
                        
                    desc_en = description
                    desc_zh = description
                    if is_desc_chinese:
                        desc_en = await api_client.translate_content(description, "en")
                    else:
                        desc_zh = await api_client.translate_content(description, "zh")
                    
                    # Handle follow-up questions
                    questions_en = []
                    questions_zh = []
                    for q in follow_up_questions:
                        if self._is_chinese(q):
                            questions_zh.append(q)
                            questions_en.append(await api_client.translate_content(q, "en"))
                        else:
                            questions_en.append(q)
                            questions_zh.append(await api_client.translate_content(q, "zh"))
                    
                    topics.append({
                        "id": f"topic_{i + 1}",
                        "name_en": title_en,
                        "name_zh": title_zh,
                        "description_en": desc_en,
                        "description_zh": desc_zh,
                        "confidence": item.get("confidence", 0.8),
                        "follow_up_questions_en": questions_en,
                        "follow_up_questions_zh": questions_zh,
                        "category": item.get("category", "general"),
                        "icon": self._get_topic_icon(title_en)
                    })
                
                return topics
            else:
                # Log AI error but still return fallback
                print(f"AI analysis failed: {result.error}")
                return self._generate_ai_fallback_topics(query)
                
        except Exception as e:
            print(f"Error analyzing query: {e}")
            return self._generate_ai_fallback_topics(query)
    
    async def create_class_chinese(self, request: ClassCreationRequest, progress_callback=None) -> ClassCreationResult:
        """Create class in Chinese"""
        return await self._create_class(request, Language.CHINESE, progress_callback=progress_callback)

    async def create_class_english(self, request: ClassCreationRequest, progress_callback=None) -> ClassCreationResult:
        """Create class in English"""
        return await self._create_class(request, Language.ENGLISH, progress_callback=progress_callback)

    async def _create_class(self, request: ClassCreationRequest, language: Language, progress_callback=None) -> ClassCreationResult:
        """Internal method to create class in any language using real AI with translation support"""
        try:
            ai_data = None
            
            # If a locked syllabus is provided, skip the initial AI query processing
            if request.syllabus:
                print(f"📌 Using locked syllabus for: {request.topic}")
                ai_data = {
                    "title": request.syllabus.get("title") or request.topic,
                    "class_title": request.syllabus.get("title") or request.topic,
                    "description": request.custom_requirements or f"Personalized lesson on {request.topic}",
                    "chapters": request.syllabus.get("chapters", []),
                    "methodology": "Mentor-led visual roadmap",
                    "raw_response": json.dumps(request.syllabus)
                }
            else:
                # Convert topic to English for processing if needed
                english_query = await self._format_english_query(request.topic, language.value)
                
                # Process with real AI (always process in English for better AI performance)
                result = await api_client.process_query(
                    topic=english_query,
                    student_level=request.student_level,
                    duration_minutes=request.duration_minutes,
                    include_video=request.include_video,
                    include_exercises=request.include_exercises,
                    include_assessment=request.include_assessment,
                    custom_requirements=request.custom_requirements,
                    target_audience=request.target_audience,
                    difficulty_level=request.difficulty_level,
                    language=Language.ENGLISH.value,  # Always use English for AI processing
                    format_type="full_class"
                )
                
                if result.success and result.data:
                    ai_data = result.data
                else:
                    print(f"AI class creation failed: {result.error}")
                    return self._create_ai_fallback_class(request, language)
            
            if ai_data:
                # Milestone 1: syllabus is ready
                if progress_callback:
                    progress_callback('syllabus_complete', 20, 'Syllabus ready')

                # Translate AI responses if language is Chinese
                if language == Language.CHINESE:
                    ai_data = await self._translate_ai_response(ai_data)

                # Extract data from AI response
                default_title = request.topic if language == Language.ENGLISH else f"{request.topic}课程"
                default_description = (
                    f"Detailed teaching plan for {request.topic}"
                    if language == Language.ENGLISH
                    else f"关于{request.topic}的详细教学方案"
                )
                class_title = ai_data.get("title") or ai_data.get("class_title") or default_title
                class_description = ai_data.get("description") or ai_data.get("class_description") or default_description
                normalized_lesson_plan = self._build_clear_lesson_plan(ai_data, class_title, class_description)
                
                # Generate Multimedia (Audio/Video) if requested
                audio_url = None
                video_url = None
                multimedia_result = None
                multimedia_error = None

                if request.include_video:
                    try:
                        print(f"🎥 Generating video content for: {class_title}")
                        # Convert to format expected by pipeline
                        pipeline_input = {
                            "id": f"lesson_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                            "title": class_title,
                            "objective": class_description,
                            "target_audience": request.target_audience,
                            "total_duration_minutes": request.duration_minutes,
                            "steps": [], # AI data is unstructured, simplified for now
                            "metadata": {"original_query": request.topic}
                        }
                        
                        # Use simpler pipeline call directly to avoid complex mapping error
                        # Create a simple explanation script based on description
                        generation_source = self._build_generation_source_content(
                            class_title=class_title,
                            class_description=class_description,
                            ai_data=ai_data,
                            lesson_plan=normalized_lesson_plan,
                        )

                        multimedia_result = await self.output_pipeline.generate_quick_explanation(
                            concept=class_title,
                            context=generation_source,
                            voice_id=request.voice_id,
                            language=language.value,
                            student_level=request.student_level,
                            target_audience=request.target_audience,
                            duration_minutes=max(10, request.duration_minutes),
                            custom_requirements=request.custom_requirements,
                            syllabus=request.syllabus,  # Pass locked syllabus to output pipeline
                            progress_callback=progress_callback,
                        )
                        
                        if multimedia_result:
                            # output.py already returns a clean relative path
                            # (e.g. "videos/manim/.../LessonScene.mp4") or a cloud URL.
                            # Store it directly — no transformation needed here.
                            audio_url = multimedia_result.get("audio", {}).get("path") or None
                            video_url = multimedia_result.get("video", {}).get("path") or None

                            print(f"✅ Multimedia generated — video_url={video_url!r}  audio_url={audio_url!r}")
                            
                    except Exception as e:
                        import traceback
                        print(f"⚠️ Multimedia generation failed: {e}")
                        print(f"⚠️ Full traceback:\n{traceback.format_exc()}")
                        # Store error for propagation to frontend
                        multimedia_error = str(e)
                
                # Handle different response formats
                pipeline_success = (not request.include_video) or bool(video_url)
                error_message = None
                if not pipeline_success:
                    error_message = multimedia_error or "Video rendering failed. No video file was produced."

                if "raw_response" in ai_data:
                    # AI returned raw text response
                    return ClassCreationResult(
                        success=pipeline_success,
                        class_title=class_title,
                        class_description=class_description,
                        learning_objectives=[
                            "理解基本概念",
                            "掌握核心技能", 
                            "应用所学知识"
                        ],
                        prerequisites=["基本知识背景"],
                        teaching_methodology="AI个性化教学",
                        lesson_plan=normalized_lesson_plan,
                        exercises=["基础练习", "进阶挑战"],
                        assessment="综合评估",
                        resources=["课程材料", "参考书籍"],
                        estimated_duration=f"{request.duration_minutes}分钟",
                        difficulty_level=request.difficulty_level,
                        target_audience=request.target_audience,
                        customization_notes="AI生成的教学方案",
                        ai_insights={
                            "generated": True,
                            "method": "ai_generated",
                            "confidence": 0.9,
                            "raw_ai_response": ai_data["raw_response"][:500] + "...",
                            "video_url": video_url,
                            "audio_url": audio_url,
                            "error": error_message,
                            "generation_debug": multimedia_result.get("debug") if multimedia_result else None,
                            "lesson_blueprint": multimedia_result.get("lesson_blueprint") if multimedia_result else None,
                            "script": multimedia_result.get("script") if multimedia_result else None,
                            "full_transcript": multimedia_result.get("full_transcript") if multimedia_result else None,
                        },
                        language_used=language,
                        audio_url=audio_url,
                        video_url=video_url
                    )
                else:
                    # AI returned structured data
                    return ClassCreationResult(
                        success=pipeline_success,
                        class_title=class_title,
                        class_description=class_description,
                        learning_objectives=ai_data.get("objectives") or ai_data.get("learning_objectives") or [],
                        prerequisites=ai_data.get("prerequisites") or [],
                        teaching_methodology=ai_data.get("methodology") or ai_data.get("teaching_methodology") or "个性化教学",
                        lesson_plan=normalized_lesson_plan,
                        exercises=ai_data.get("exercises") or [],
                        assessment=ai_data.get("assessment") or "",
                        resources=ai_data.get("resources") or [],
                        estimated_duration=ai_data.get("duration") or f"{request.duration_minutes}分钟",
                        difficulty_level=ai_data.get("difficulty") or request.difficulty_level,
                        target_audience=ai_data.get("audience") or request.target_audience,
                        customization_notes=ai_data.get("notes") or "AI生成的教学方案",
                        ai_insights={
                            "generated": True,
                            "method": "ai_structured",
                            "confidence": 0.95,
                            "ai_provider": "DeepSeek",
                            "video_url": video_url,
                            "audio_url": audio_url,
                            "error": error_message,
                            "generation_debug": multimedia_result.get("debug") if multimedia_result else None,
                            "lesson_blueprint": multimedia_result.get("lesson_blueprint") if multimedia_result else None,
                            "script": multimedia_result.get("script") if multimedia_result else None,
                            "full_transcript": multimedia_result.get("full_transcript") if multimedia_result else None,
                        },
                        language_used=language,
                        audio_url=audio_url,
                        video_url=video_url
                    )
            else:
                print(f"AI class creation failed: {result.error}")
                return self._create_ai_fallback_class(request, language)
                
        except Exception as e:
            print(f"Error creating class with AI: {e}")
            return self._create_ai_fallback_class(request, language)

    def _build_generation_source_content(
        self,
        *,
        class_title: str,
        class_description: str,
        ai_data: Dict[str, Any],
        lesson_plan: Dict[str, Any],
    ) -> str:
        sections = [
            f"Lesson title: {class_title}",
            f"Lesson description: {class_description}",
        ]

        objectives = ai_data.get("objectives") or ai_data.get("learning_objectives") or lesson_plan.get("learning_objectives") or []
        if objectives:
            sections.append("Learning objectives:\n- " + "\n- ".join(str(item) for item in objectives[:6]))

        prerequisites = ai_data.get("prerequisites") or lesson_plan.get("prerequisites") or []
        if prerequisites:
            sections.append("Prerequisites:\n- " + "\n- ".join(str(item) for item in prerequisites[:4]))

        chapters = lesson_plan.get("chapters") or []
        if chapters:
            chapter_lines = []
            for chapter in chapters[:10]:
                if isinstance(chapter, dict):
                    title = chapter.get("title") or chapter.get("step") or "Chapter"
                    summary = chapter.get("summary") or chapter.get("content") or chapter.get("learning_goal") or ""
                    chapter_lines.append(f"- {title}: {summary}")
                else:
                    chapter_lines.append(f"- {chapter}")
            sections.append("Teaching flow:\n" + "\n".join(chapter_lines))

        practice = lesson_plan.get("practice") or []
        if practice:
            sections.append("Practice:\n- " + "\n- ".join(str(item) for item in practice[:5]))

        assessment = lesson_plan.get("assessment")
        if assessment:
            sections.append(f"Assessment: {assessment}")

        methodology = ai_data.get("methodology") or ai_data.get("teaching_methodology")
        if methodology:
            sections.append(f"Teaching methodology: {methodology}")

        return "\n\n".join(section for section in sections if section)

    def _build_clear_lesson_plan(
        self,
        ai_data: Dict[str, Any],
        class_title: str,
        class_description: str,
    ) -> Dict[str, Any]:
        raw_plan = ai_data.get("lesson_plan") or {}
        objectives = ai_data.get("objectives") or ai_data.get("learning_objectives") or []
        prerequisites = ai_data.get("prerequisites") or []
        exercises = ai_data.get("exercises") or []
        assessment = ai_data.get("assessment") or ""

        chapters: List[Dict[str, Any]] = []
        if isinstance(raw_plan, list):
            for index, item in enumerate(raw_plan, start=1):
                if isinstance(item, dict):
                    chapters.append({
                        "id": f"chapter_{index}",
                        "title": item.get("title") or item.get("step") or f"Part {index}",
                        "summary": item.get("content") or item.get("description") or "",
                        "duration_minutes": item.get("duration_minutes"),
                    })
                else:
                    chapters.append({
                        "id": f"chapter_{index}",
                        "title": f"Part {index}",
                        "summary": str(item),
                        "duration_minutes": None,
                    })
        elif isinstance(raw_plan, dict):
            for index, (key, value) in enumerate(raw_plan.items(), start=1):
                if isinstance(value, dict):
                    summary = value.get("content") or value.get("description") or json.dumps(value, ensure_ascii=False)
                elif isinstance(value, list):
                    summary = "; ".join(str(item) for item in value[:5])
                else:
                    summary = str(value)
                chapters.append({
                    "id": f"chapter_{index}",
                    "title": key.replace("_", " ").strip().title(),
                    "summary": summary,
                    "duration_minutes": None,
                })

        if not chapters:
            chapters = [
                {"id": "chapter_1", "title": "Introduction", "summary": class_description, "duration_minutes": None},
                {"id": "chapter_2", "title": "Core Concepts", "summary": "Explain the core idea and why it works.", "duration_minutes": None},
                {"id": "chapter_3", "title": "Worked Example", "summary": "Walk through one concrete example step by step.", "duration_minutes": None},
                {"id": "chapter_4", "title": "Practice and Recap", "summary": "Check understanding and recap the key takeaway.", "duration_minutes": None},
            ]

        return {
            "title": class_title,
            "overview": class_description,
            "learning_objectives": [str(item) for item in objectives[:6]],
            "prerequisites": [str(item) for item in prerequisites[:4]],
            "chapters": chapters[:12],
            "practice": [str(item) for item in exercises[:6]],
            "assessment": assessment,
        }
    
    async def _format_english_query(self, query: str, current_lang: str) -> str:
        """Convert query to English if it's in Chinese using AI translation"""
        if current_lang == "zh" and self._is_chinese(query):
            try:
                # Use AI translation for better accuracy
                result = await api_client.translate_to_english(query)
                if result.success and result.data:
                    translated = result.data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if translated:
                        return translated
            except Exception as e:
                print(f"AI translation failed, using fallback: {e}")
            
            # Fallback to simple mapping
            chinese_to_english = {
                "Python编程": "Python programming",
                "学习Python": "Learn Python",
                "我想学习": "I want to learn",
                "数据分析": "Data analysis", 
                "机器学习": "Machine learning",
                "网站开发": "Web development",
                "人工智能": "Artificial intelligence",
                "生物的演化": "biological evolution",
                "数学": "mathematics",
                "物理": "physics",
                "化学": "chemistry",
                "历史": "history",
                "地理": "geography"
            }
            
            for chinese, english in chinese_to_english.items():
                if chinese in query:
                    query = query.replace(chinese, english)
                    break
            
            return query
        else:
            return query
    
    def _is_chinese(self, text: str) -> bool:
        """Check if text contains Chinese characters"""
        import re
        # Check for Chinese characters (CJK Unified Ideographs)
        chinese_pattern = re.compile(r'[\u4e00-\u9fff]')
        return bool(chinese_pattern.search(text))
    
    async def _translate_ai_response(self, ai_data: Dict[str, Any]) -> Dict[str, Any]:
        """Translate AI response from English to Chinese"""
        try:
            translated_data = {}
            
            for key, value in ai_data.items():
                if isinstance(value, str):
                    # Translate string values
                    if not self._is_chinese(value):
                        translated_data[key] = await api_client.translate_content(value, "zh")
                    else:
                        translated_data[key] = value
                elif isinstance(value, list):
                    # Translate list items
                    translated_list = []
                    for item in value:
                        if isinstance(item, str):
                            if not self._is_chinese(item):
                                translated_list.append(await api_client.translate_content(item, "zh"))
                            else:
                                translated_list.append(item)
                        elif isinstance(item, dict):
                            # Recursively translate nested dictionaries
                            translated_list.append(await self._translate_ai_response(item))
                        else:
                            translated_list.append(item)
                    translated_data[key] = translated_list
                elif isinstance(value, dict):
                    # Recursively translate nested dictionaries
                    translated_data[key] = await self._translate_ai_response(value)
                else:
                    translated_data[key] = value
            
            return translated_data
        except Exception as e:
            print(f"Warning: Translation failed: {e}")
            return ai_data  # Return original data if translation fails
    
    def _generate_fallback_topics(self, query: str) -> List[Dict[str, Any]]:
        """Generate fallback topics when AI fails"""
        return [
            {
                "id": "fallback_1",
                "name": f"Learning {query}",
                "description": f"Introduction to {query} fundamentals",
                "confidence": 0.7,
                "icon": "📚",
                "category": "learning",
                "follow_up_questions": [
                    "What specific aspects interest you?",
                    "What's your current experience level?",
                    "Do you prefer hands-on or theory?"
                ]
            }
        ]
    
    def _get_topic_icon(self, topic_name: str) -> str:
        """Get appropriate icon for topic"""
        topic_lower = topic_name.lower()
        if any(word in topic_lower for word in ["python", "编程", "code", "开发"]):
            return "🐍"
        elif any(word in topic_lower for word in ["数据", "分析", "统计", "math"]):
            return "📊"
        elif any(word in topic_lower for word in ["ai", "人工智能", "机器学习"]):
            return "🤖"
        elif any(word in topic_lower for word in ["web", "网站", "前端", "后端"]):
            return "🌐"
        elif any(word in topic_lower for word in ["语言", "英语", "中文", "日语"]):
            return "🗣️"
        else:
            return "📚"
    
    def _get_topic_category(self, topic_name: str) -> str:
        """Get category for topic"""
        topic_lower = topic_name.lower()
        if any(word in topic_lower for word in ["python", "编程", "code", "开发"]):
            return "programming"
        elif any(word in topic_lower for word in ["数据", "分析", "统计", "math"]):
            return "data_science"
        elif any(word in topic_lower for word in ["ai", "人工智能", "机器学习"]):
            return "ai"
        elif any(word in topic_lower for word in ["语言", "英语", "中文", "日语"]):
            return "language"
        else:
            return "learning"
    
    def _generate_ai_fallback_topics(self, query: str) -> List[Dict[str, Any]]:
        """Generate AI-style fallback topics when AI fails"""
        return [
            {
                "id": "ai_topic_1",
                "name": f"深入学习{query}",
                "description": f"基于AI分析的{query}专题学习",
                "confidence": 0.75,
                "icon": self._get_topic_icon(query),
                "category": self._get_topic_category(query),
                "follow_up_questions": [
                    "请详细说明你的学习目标",
                    "你希望学习什么具体内容？",
                    "你的时间安排是怎样的？",
                    "你是否有相关基础？"
                ]
            },
            {
                "id": "ai_topic_2",
                "name": f"{query}实践应用",
                "description": f"将{query}知识应用于实际场景",
                "confidence": 0.7,
                "icon": "🔧",
                "category": "practical",
                "follow_up_questions": [
                    "你希望解决什么实际问题？",
                    "你是否有具体的应用场景？",
                    "你希望达到什么效果？"
                ]
            }
        ]
    
    def _create_ai_fallback_class(self, request: ClassCreationRequest, language: Language) -> ClassCreationResult:
        """Create AI-style fallback class when AI fails"""
        if language == Language.ENGLISH:
            title = f"AI-Powered {request.topic} Course"
            description = f"Comprehensive AI-generated course on {request.topic}"
        else:
            title = f"AI驱动{request.topic}课程"
            description = f"基于AI生成的{request.topic}全面教学方案"

        return ClassCreationResult(
            success=False,
            class_title=title,
            class_description=description,
            learning_objectives=[
                "掌握核心概念与原理",
                "学会实际应用方法",
                "培养问题解决能力"
            ],
            prerequisites=[
                "基本知识背景",
                "学习兴趣与动力"
            ],
            teaching_methodology="AI个性化教学 + 实践导向",
            lesson_plan={
                "模块一": "基础概念讲解",
                "模块二": "核心技能训练", 
                "模块三": "实际案例应用",
                "模块四": "综合项目实践"
            },
            exercises=[
                "概念理解练习",
                "技能应用任务",
                "综合项目挑战"
            ],
            assessment="过程评估 + 成果展示",
            resources=[
                "AI生成的学习材料",
                "精选参考资源",
                "在线实践工具"
            ],
            estimated_duration=f"{request.duration_minutes}分钟",
            difficulty_level=request.difficulty_level,
            target_audience=request.target_audience,
            customization_notes="AI辅助生成的教学方案",
            ai_insights={
                "generated": True,
                "method": "ai_assisted_fallback",
                "confidence": 0.0,
                "note": "AI service temporarily unavailable" if language == Language.ENGLISH else "AI服务暂时不可用",
                "video_url": None,
                "audio_url": None,
                "error": "AI service failed to generate content. Please try again later."
                    if language == Language.ENGLISH
                    else "AI服务无法生成内容，请稍后重试。",
            },
            language_used=language
        )
