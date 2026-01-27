"""
Lesson Storage Module for MentorMind
Simple file-based storage for created lessons (no mock data)
"""

import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import hashlib

from config import config


@dataclass
class LessonMetadata:
    """Metadata for a created lesson"""
    id: str
    timestamp: str
    query: str
    language: str
    student_level: str
    duration_minutes: int
    class_title: str
    class_description: str
    quality_score: float = 0.0
    cost_usd: float = 0.0
    ai_insights: Dict[str, Any] = None
    full_data: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.ai_insights is None:
            self.ai_insights = {}
        if self.full_data is None:
            self.full_data = {}


class LessonStorage:
    """Simple file-based storage for lessons"""
    
    def __init__(self, storage_dir: str = None):
        self.storage_dir = storage_dir or os.path.join(config.DATA_DIR, "lessons")
        os.makedirs(self.storage_dir, exist_ok=True)
        self.metadata_file = os.path.join(self.storage_dir, "metadata.json")
        self._ensure_metadata_file()
    
    def _ensure_metadata_file(self):
        """Ensure metadata file exists"""
        if not os.path.exists(self.metadata_file):
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump({"lessons": [], "next_id": 1}, f, ensure_ascii=False, indent=2)
    
    def _load_metadata(self) -> Dict[str, Any]:
        """Load metadata from file"""
        with open(self.metadata_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _save_metadata(self, metadata: Dict[str, Any]):
        """Save metadata to file"""
        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    def _save_lesson_data(self, lesson_id: str, lesson_data: Dict[str, Any]):
        """Save full lesson data to separate file"""
        lesson_file = os.path.join(self.storage_dir, f"{lesson_id}.json")
        with open(lesson_file, 'w', encoding='utf-8') as f:
            json.dump(lesson_data, f, ensure_ascii=False, indent=2)
    
    def _load_lesson_data(self, lesson_id: str) -> Optional[Dict[str, Any]]:
        """Load full lesson data from file"""
        lesson_file = os.path.join(self.storage_dir, f"{lesson_id}.json")
        if os.path.exists(lesson_file):
            with open(lesson_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    
    def save_lesson(self, lesson_data: Dict[str, Any]) -> LessonMetadata:
        """
        Save a created lesson to storage
        
        Args:
            lesson_data: The full lesson data from create-class endpoint
            
        Returns:
            LessonMetadata object with saved lesson info
        """
        # Generate unique ID
        lesson_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Extract metadata
        query = lesson_data.get("topic", "")
        language = lesson_data.get("language", "zh")
        student_level = lesson_data.get("student_level", "beginner")
        duration_minutes = lesson_data.get("duration_minutes", 30)
        class_title = lesson_data.get("class_title", "")
        class_description = lesson_data.get("class_description", "")
        
        # Calculate quality score from AI insights if available
        ai_insights = lesson_data.get("ai_insights", {})
        quality_score = ai_insights.get("confidence", 0.8)
        
        # Estimate cost (simplified - would be more complex in production)
        # Assuming ~1000 tokens for a lesson, DeepSeek costs $0.001 per 1K tokens
        cost_usd = 0.001
        
        # Create metadata
        metadata = LessonMetadata(
            id=lesson_id,
            timestamp=timestamp,
            query=query,
            language=language,
            student_level=student_level,
            duration_minutes=duration_minutes,
            class_title=class_title,
            class_description=class_description,
            quality_score=quality_score,
            cost_usd=cost_usd,
            ai_insights=ai_insights,
            full_data=lesson_data
        )
        
        # Load current metadata
        current_metadata = self._load_metadata()
        
        # Add to metadata list
        current_metadata["lessons"].append(asdict(metadata))
        
        # Save metadata
        self._save_metadata(current_metadata)
        
        # Save full lesson data
        self._save_lesson_data(lesson_id, lesson_data)
        
        print(f"✅ Lesson saved: {lesson_id} - {class_title}")
        return metadata
    
    def get_all_lessons(self) -> List[LessonMetadata]:
        """Get all saved lessons"""
        metadata = self._load_metadata()
        lessons = []
        
        for lesson_dict in metadata.get("lessons", []):
            # Convert dict back to LessonMetadata object
            lesson = LessonMetadata(**lesson_dict)
            lessons.append(lesson)
        
        return lessons
    
    def get_lesson(self, lesson_id: str) -> Optional[Dict[str, Any]]:
        """Get full lesson data by ID"""
        return self._load_lesson_data(lesson_id)
    
    def delete_lesson(self, lesson_id: str) -> bool:
        """Delete a lesson by ID"""
        # Load metadata
        metadata = self._load_metadata()
        
        # Remove from metadata
        original_count = len(metadata["lessons"])
        metadata["lessons"] = [l for l in metadata["lessons"] if l["id"] != lesson_id]
        
        if len(metadata["lessons"]) < original_count:
            # Save updated metadata
            self._save_metadata(metadata)
            
            # Delete lesson data file
            lesson_file = os.path.join(self.storage_dir, f"{lesson_id}.json")
            if os.path.exists(lesson_file):
                os.remove(lesson_file)
            
            print(f"🗑️ Lesson deleted: {lesson_id}")
            return True
        
        return False
    
    def get_lesson_count(self) -> int:
        """Get total number of saved lessons"""
        metadata = self._load_metadata()
        return len(metadata.get("lessons", []))
    
    def clear_all_lessons(self):
        """Clear all saved lessons (for testing)"""
        metadata = self._load_metadata()
        metadata["lessons"] = []
        self._save_metadata(metadata)
        
        # Delete all lesson data files
        for filename in os.listdir(self.storage_dir):
            if filename.endswith(".json") and filename != "metadata.json":
                os.remove(os.path.join(self.storage_dir, filename))
        
        print("🧹 All lessons cleared")


# Global storage instance
lesson_storage = LessonStorage()


def test_storage():
    """Test the storage system"""
    print("🧪 Testing lesson storage...")
    
    # Create a test lesson
    test_lesson = {
        "success": True,
        "language": "zh",
        "topic": "Python编程基础",
        "class_title": "Python编程入门教程",
        "class_description": "学习Python编程的基础知识和语法",
        "student_level": "beginner",
        "duration_minutes": 45,
        "learning_objectives": ["理解变量和数据类型", "掌握基本语法", "学会编写简单程序"],
        "ai_insights": {
            "generated": True,
            "method": "ai_structured",
            "confidence": 0.9,
            "ai_provider": "DeepSeek"
        }
    }
    
    # Save the lesson
    metadata = lesson_storage.save_lesson(test_lesson)
    print(f"✅ Saved lesson: {metadata.class_title}")
    
    # Get all lessons
    all_lessons = lesson_storage.get_all_lessons()
    print(f"📊 Total lessons: {len(all_lessons)}")
    
    # Get specific lesson
    lesson_data = lesson_storage.get_lesson(metadata.id)
    print(f"📋 Lesson data retrieved: {lesson_data is not None}")
    
    # Clean up
    lesson_storage.delete_lesson(metadata.id)
    print("🧹 Test cleanup completed")


if __name__ == "__main__":
    test_storage()