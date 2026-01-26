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
from api_client import api_client
from modules.cognitive import CognitiveProcessor
from modules.agentic import TeachingAgent, LessonPlan, QualityAssessment
from modules.output import OutputPipeline


class Language(Enum):
    """Supported languages for class creation"""
    ENGLISH = "en"
    CHINESE = "zh"
    JAPANESE = "ja"
    KOREAN = "ko"


@dataclass
class ClassCreationRequest:
    """Request for creating a class/lesson"""
    topic: str
    language: Language
    student_level: str = "beginner"
    duration_minutes: int = 30
    include_video: bool = True
    include_exercises: bool = True
    include_assessment: bool = True
    custom_requirements: Optional[str] = None
    target_audience: str = "students"
    difficulty_level: str = "intermediate"


@dataclass
class ClassCreationResult:
    """Result of class creation"""
    success: bool
    lesson_plan: Optional[LessonPlan] = None
    quality_assessment: Optional[QualityAssessment] = None
    output_result: Optional[Dict] = None
    error_message: Optional[str] = None
    processing_time_seconds: float = 0.0
    cost_usd: float = 0.0
    language_used: Optional[Language] = None


class ClassCreator:
    """
    Main class for creating educational classes/lessons in multiple languages
    Supports both English and Chinese versions
    """
    
    def __init__(self):
        self.cognitive_processor = CognitiveProcessor()
        self.teaching_agent = TeachingAgent()
        self.output_pipeline = OutputPipeline()
        
    async def create_class_english(self, request: ClassCreationRequest) -> ClassCreationResult:
        """
        Create a class/lesson in English
        
        Args:
            request: Class creation request
            
        Returns:
            ClassCreationResult with English content
        """
        start_time = datetime.now()
        
        try:
            # Convert topic to student query format for English
            student_query = self._format_english_query(request.topic, request.student_level)
            
            # Process the query
            result = await self._process_query(
                student_query=student_query,
                language=Language.ENGLISH,
                student_level=request.student_level,
                duration_minutes=request.duration_minutes,
                include_video=request.include_video,
                custom_requirements=request.custom_requirements
            )
            
            # Add language information
            result.language_used = Language.ENGLISH
            
            # Calculate processing time
            result.processing_time_seconds = (datetime.now() - start_time).total_seconds()
            
            return result
            
        except Exception as e:
            return ClassCreationResult(
                success=False,
                error_message=f"Error creating English class: {str(e)}",
                language_used=Language.ENGLISH
            )
    
    async def create_class_chinese(self, request: ClassCreationRequest) -> ClassCreationResult:
        """
        Create a class/lesson in Chinese
        
        Args:
            request: Class creation request
            
        Returns:
            ClassCreationResult with Chinese content
        """
        start_time = datetime.now()
        
        try:
            # Convert topic to student query format for Chinese
            student_query = self._format_chinese_query(request.topic, request.student_level)
            
            # Process the query
            result = await self._process_query(
                student_query=student_query,
                language=Language.CHINESE,
                student_level=request.student_level,
                duration_minutes=request.duration_minutes,
                include_video=request.include_video,
                custom_requirements=request.custom_requirements
            )
            
            # Add language information
            result.language_used = Language.CHINESE
            
            # Calculate processing time
            result.processing_time_seconds = (datetime.now() - start_time).total_seconds()
            
            return result
            
        except Exception as e:
            return ClassCreationResult(
                success=False,
                error_message=f"Error creating Chinese class: {str(e)}",
                language_used=Language.CHINESE
            )
    
    async def create_class_bilingual(self, request: ClassCreationRequest) -> Dict[str, ClassCreationResult]:
        """
        Create a class/lesson in both English and Chinese
        
        Args:
            request: Class creation request
            
        Returns:
            Dictionary with both English and Chinese results
        """
        # Create English version
        english_request = ClassCreationRequest(
            topic=request.topic,
            language=Language.ENGLISH,
            student_level=request.student_level,
            duration_minutes=request.duration_minutes,
            include_video=request.include_video,
            include_exercises=request.include_exercises,
            include_assessment=request.include_assessment,
            custom_requirements=request.custom_requirements,
            target_audience=request.target_audience,
            difficulty_level=request.difficulty_level
        )
        
        # Create Chinese version
        chinese_request = ClassCreationRequest(
            topic=request.topic,
            language=Language.CHINESE,
            student_level=request.student_level,
            duration_minutes=request.duration_minutes,
            include_video=request.include_video,
            include_exercises=request.include_exercises,
            include_assessment=request.include_assessment,
            custom_requirements=request.custom_requirements,
            target_audience=request.target_audience,
            difficulty_level=request.difficulty_level
        )
        
        # Run both in parallel
        english_task = asyncio.create_task(self.create_class_english(english_request))
        chinese_task = asyncio.create_task(self.create_class_chinese(chinese_request))
        
        english_result = await english_task
        chinese_result = await chinese_task
        
        return {
            "english": english_result,
            "chinese": chinese_result
        }
    
    def _format_english_query(self, topic: str, student_level: str) -> str:
        """Format topic as an English student query"""
        level_map = {
            "beginner": "beginner",
            "intermediate": "intermediate",
            "advanced": "advanced"
        }
        
        level = level_map.get(student_level, "beginner")
        
        return f"I want to learn about {topic}. I am a {level} level student. Can you teach me this topic step by step?"
    
    def _format_chinese_query(self, topic: str, student_level: str) -> str:
        """Format topic as a Chinese student query"""
        level_map = {
            "beginner": "初学者",
            "intermediate": "中级",
            "advanced": "高级"
        }
        
        level = level_map.get(student_level, "初学者")
        
        return f"我想学习{topic}。我是{level}水平的学生。你能一步步教我这个问题吗？"
    
    async def _process_query(
        self,
        student_query: str,
        language: Language,
        student_level: str,
        duration_minutes: int,
        include_video: bool,
        custom_requirements: Optional[str] = None
    ) -> ClassCreationResult:
        """Internal method to process a student query"""
        try:
            # Step 1: Create context from query
            context_blocks = [{
                "timestamp": 0.0,
                "audio_text": student_query,
                "slide_text": "",
                "confidence": 1.0
            }]
            
            # Step 2: Cognitive processing
            cognitive_result = await self.cognitive_processor.process_context_blocks(context_blocks)
            
            # Step 3: Generate lesson plan with language-specific adjustments
            lesson_plan, quality_assessment, attempts = await self.teaching_agent.teach(
                student_query=student_query,
                knowledge_graph=cognitive_result,
                student_level=student_level,
                max_attempts=2
            )
            
            # Step 4: Generate output
            output_result = await self.output_pipeline.generate_teaching_output(
                lesson_plan.to_dict()
            )
            
            # Calculate cost
            cost_usd = output_result.get("metadata", {}).get("cost_estimation", {}).get("total_usd", 0.0)
            
            return ClassCreationResult(
                success=True,
                lesson_plan=lesson_plan,
                quality_assessment=quality_assessment,
                output_result=output_result,
                cost_usd=cost_usd,
                language_used=language
            )
            
        except Exception as e:
            return ClassCreationResult(
                success=False,
                error_message=f"Processing error: {str(e)}",
                language_used=language
            )
    
    def get_language_support_info(self) -> Dict:
        """Get information about supported languages"""
        return {
            "supported_languages": [
                {"code": "en", "name": "English", "native_name": "English"},
                {"code": "zh", "name": "Chinese", "native_name": "中文"},
                {"code": "ja", "name": "Japanese", "native_name": "日本語"},
                {"code": "ko", "name": "Korean", "native_name": "한국어"}
            ],
            "default_language": "zh",
            "bilingual_support": True,
            "translation_available": True
        }


# Example usage functions
async def example_create_english_class():
    """Example: Create an English class"""
    creator = ClassCreator()
    
    request = ClassCreationRequest(
        topic="Python programming basics",
        language=Language.ENGLISH,
        student_level="beginner",
        duration_minutes=45,
        include_video=True,
        include_exercises=True,
        include_assessment=True
    )
    
    result = await creator.create_class_english(request)
    
    if result.success:
        print(f"✅ English class created successfully!")
        print(f"   Title: {result.lesson_plan.title}")
        print(f"   Duration: {result.lesson_plan.total_duration_minutes} minutes")
        print(f"   Quality score: {result.quality_assessment.overall_score:.2f}")
        print(f"   Cost: ${result.cost_usd:.4f}")
    else:
        print(f"❌ Failed to create English class: {result.error_message}")
    
    return result


async def example_create_chinese_class():
    """Example: Create a Chinese class"""
    creator = ClassCreator()
    
    request = ClassCreationRequest(
        topic="Python编程基础",
        language=Language.CHINESE,
        student_level="beginner",
        duration_minutes=45,
        include_video=True,
        include_exercises=True,
        include_assessment=True
    )
    
    result = await creator.create_class_chinese(request)
    
    if result.success:
        print(f"✅ 中文课程创建成功！")
        print(f"   标题: {result.lesson_plan.title}")
        print(f"   时长: {result.lesson_plan.total_duration_minutes} 分钟")
        print(f"   质量评分: {result.quality_assessment.overall_score:.2f}")
        print(f"   成本: ${result.cost_usd:.4f}")
    else:
        print(f"❌ 创建中文课程失败: {result.error_message}")
    
    return result


async def example_create_bilingual_class():
    """Example: Create a bilingual class (English + Chinese)"""
    creator = ClassCreator()
    
    request = ClassCreationRequest(
        topic="Machine Learning fundamentals",
        language=Language.ENGLISH,  # Base language
        student_level="intermediate",
        duration_minutes=60,
        include_video=True,
        include_exercises=True,
        include_assessment=True
    )
    
    results = await creator.create_class_bilingual(request)
    
    print("\n=== BILINGUAL CLASS CREATION RESULTS ===")
    
    # English result
    english_result = results["english"]
    if english_result.success:
        print(f"\n✅ English Version:")
        print(f"   Title: {english_result.lesson_plan.title}")
        print(f"   Quality: {english_result.quality_assessment.overall_score:.2f}")
    else:
        print(f"\n❌ English version failed: {english_result.error_message}")
    
    # Chinese result
    chinese_result = results["chinese"]
    if chinese_result.success:
        print(f"\n✅ 中文版本:")
        print(f"   标题: {chinese_result.lesson_plan.title}")
        print(f"   质量: {chinese_result.quality_assessment.overall_score:.2f}")
    else:
        print(f"\n❌ 中文版本失败: {chinese_result.error_message}")
    
    return results


def save_class_result(result: ClassCreationResult, filename: str = None):
    """Save class creation result to JSON file"""
    if not result.success:
        print("Cannot save failed result")
        return None
    
    # Create results directory if it doesn't exist
    os.makedirs("results", exist_ok=True)
    
    # Generate filename if not provided
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        language_code = result.language_used.value if result.language_used else "unknown"
        filename = f"class_{language_code}_{timestamp}.json"
    
    filepath = os.path.join("results", filename)
    
    # Prepare data for saving
    data = {
        "timestamp": datetime.now().isoformat(),
        "success": result.success,
        "language": result.language_used.value if result.language_used else None,
        "lesson_plan": result.lesson_plan.to_dict() if result.lesson_plan else None,
        "quality_assessment": result.quality_assessment.to_dict() if result.quality_assessment else None,
        "output_result": result.output_result,
        "cost_usd": result.cost_usd,
        "processing_time_seconds": result.processing_time_seconds
    }
    
    # Save to file
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Result saved to: {filepath}")
    return filepath


async def main():
    """Main function for testing"""
    print("=" * 60)
    print("MENTORMIND CLASS CREATOR")
    print("English + Chinese Version")
    print("=" * 60)
    
    # Test API connections first
    print("\nTesting API connections...")
    api_results = await api_client.test_connection()
    
    all_connected = all(api_results.values())
    if not all_connected:
        print("⚠️  Some API connections failed. Continuing anyway...")
    
    # Show language support info
    creator = ClassCreator()
    lang_info = creator.get_language_support_info()
    
    print(f"\nSupported languages:")
    for lang in lang_info["supported_languages"]:
        print(f"  • {lang['name']} ({lang['native_name']}) - code: {lang['code']}")
    
    # Example: Create English class
    print("\n" + "-" * 40)
    print("Example 1: Creating English Class")
    print("-" * 40)
    english_result = await example_create_english_class()
    
    # Example: Create Chinese class
    print("\n" + "-" * 40)
    print("Example 2: Creating Chinese Class")
    print("-" * 40)
    chinese_result = await example_create_chinese_class()
    
    # Example: Create bilingual class
    print("\n" + "-" * 40)
    print("Example 3: Creating Bilingual Class")
    print("-" * 40)
    bilingual_results = await example_create_bilingual_class()
    
    # Save results
    print("\n" + "-" * 40)
    print("Saving Results")
    print("-" * 40)
    
    if english_result.success:
        save_class_result(english_result, "example_english_class.json")
    
    if chinese_result.success:
        save_class_result(chinese_result, "example_chinese_class.json")
    
    print("\n✅ Class creation examples completed!")
    print("Results saved to 'results/' directory")


if __name__ == "__main__":
    # Create necessary directories
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/videos", exist_ok=True)
    os.makedirs("data/test", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs(".cache", exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    
    # Run main function
    asyncio.run(main())