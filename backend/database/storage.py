"""
Database Storage Module
PostgreSQL-based storage implementation using SQLAlchemy models
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, and_, or_

from .base import SessionLocal
from .models.lesson import Lesson, LessonObjective, LessonResource, LessonExercise
from .models.enums import Language, StudentLevel, DifficultyLevel, ResourceType, ExerciseType, LessonStatus
from .models.user import User, UserLesson
from .models.analytics import AnalyticsEvent, AnalyticsEventType, DailyMetrics, APILog


class LessonStorageSQL:
    """PostgreSQL-based storage for lessons with advanced querying"""
    
    def __init__(self):
        self.SessionLocal = SessionLocal
    
    def save_lesson(self, lesson_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save a created lesson to PostgreSQL database.
        
        Args:
            lesson_data: The full lesson data from create-class endpoint
            
        Returns:
            Dictionary with saved lesson info including ID
        """
        session = self.SessionLocal()
        try:
            # Extract core data
            title = lesson_data.get("class_title", "")
            description = lesson_data.get("class_description", "")
            topic = lesson_data.get("topic", "")
            
            # Extract metadata with defaults
            language = lesson_data.get("language", Language.CHINESE.value)
            student_level = lesson_data.get("student_level", StudentLevel.BEGINNER.value)
            difficulty_level = lesson_data.get("difficulty_level", DifficultyLevel.MEDIUM.value)
            duration_minutes = lesson_data.get("duration_minutes", 30)
            
            # Extract quality and cost
            quality_score = lesson_data.get("quality_score", 0.8)
            cost_usd = lesson_data.get("cost_usd", 0.001)
            
            # Extract AI insights
            ai_insights = lesson_data.get("ai_insights", {})
            # Ensure it's a dictionary to safely add URLs
            if isinstance(ai_insights, dict):
                ai_insights["video_url"] = lesson_data.get("video_url")
                ai_insights["audio_url"] = lesson_data.get("audio_url")
            
            # Create lesson record
            lesson = Lesson(
                title=title,
                description=description,
                topic=topic,
                language=language,
                student_level=student_level,
                difficulty_level=difficulty_level,
                duration_minutes=duration_minutes,
                quality_score=quality_score,
                cost_usd=cost_usd,
                ai_insights=ai_insights,
                status=LessonStatus.PUBLISHED.value
            )
            
            # Add learning objectives
            objectives = lesson_data.get("learning_objectives", [])
            for i, objective in enumerate(objectives):
                if objective:  # Skip empty objectives
                    lesson.objectives.append(
                        LessonObjective(
                            objective=str(objective),
                            order_index=i
                        )
                    )
            
            # Add resources
            resources = lesson_data.get("resources", [])
            for resource in resources:
                if isinstance(resource, str):
                    lesson.resources.append(
                        LessonResource(
                            resource_type=ResourceType.DOCUMENT.value,
                            title=resource,
                            description="Learning resource"
                        )
                    )
                elif isinstance(resource, dict):
                    lesson.resources.append(
                        LessonResource(
                            resource_type=resource.get("type", ResourceType.DOCUMENT.value),
                            title=resource.get("title", ""),
                            url=resource.get("url", ""),
                            description=resource.get("description", "")
                        )
                    )
            
            # Add exercises
            exercises = lesson_data.get("exercises", [])
            for exercise in exercises:
                if isinstance(exercise, str):
                    lesson.exercises.append(
                        LessonExercise(
                            exercise_type=ExerciseType.QUIZ.value,
                            question=exercise,
                            difficulty="medium"
                        )
                    )
                elif isinstance(exercise, dict):
                    lesson.exercises.append(
                        LessonExercise(
                            exercise_type=exercise.get("type", ExerciseType.QUIZ.value),
                            question=exercise.get("question", ""),
                            answer=exercise.get("answer", ""),
                            difficulty=exercise.get("difficulty", "medium")
                        )
                    )
            
            # Save to database
            session.add(lesson)
            session.commit()
            session.refresh(lesson)
            
            # Log analytics event
            self._log_analytics_event(
                session=session,
                event_type=AnalyticsEventType.LESSON_CREATED,
                lesson_id=lesson.id,
                metadata={
                    "language": language,
                    "student_level": student_level,
                    "difficulty": difficulty_level,
                    "duration": duration_minutes,
                    "quality_score": quality_score,
                    "cost_usd": cost_usd
                }
            )
            
            print(f"✅ Lesson saved to database: {lesson.id} - {title}")
            
            # Return saved lesson info
            return {
                "id": str(lesson.id),
                "title": lesson.title,
                "description": lesson.description,
                "topic": lesson.topic,
                "language": lesson.language,
                "student_level": lesson.student_level,
                "duration_minutes": lesson.duration_minutes,
                "quality_score": lesson.quality_score,
                "cost_usd": lesson.cost_usd,
                "created_at": lesson.created_at.isoformat() if lesson.created_at else None
            }
            
        except Exception as e:
            session.rollback()
            print(f"❌ Failed to save lesson to database: {e}")
            raise
        finally:
            session.close()
    
    def get_all_lessons(
        self, 
        language: Optional[str] = None,
        student_level: Optional[str] = None,
        difficulty: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get all saved lessons with filtering, sorting, and pagination.
        
        Args:
            language: Filter by language (zh, en, etc.)
            student_level: Filter by student level
            difficulty: Filter by difficulty level
            status: Filter by lesson status
            limit: Maximum number of lessons to return
            offset: Pagination offset
            sort_by: Field to sort by (created_at, updated_at, quality_score, title)
            sort_order: Sort order (asc, desc)
            
        Returns:
            Tuple of (lessons list, total count)
        """
        session = self.SessionLocal()
        try:
            # Build query
            query = session.query(Lesson)
            
            # Apply filters
            if language:
                query = query.filter(Lesson.language == language)
            if student_level:
                query = query.filter(Lesson.student_level == student_level)
            if difficulty:
                query = query.filter(Lesson.difficulty_level == difficulty)
            if status:
                query = query.filter(Lesson.status == status)
            else:
                # Default: only published lessons
                query = query.filter(Lesson.status == LessonStatus.PUBLISHED.value)
            
            # Get total count
            total_count = query.count()
            
            # Apply sorting
            sort_column = {
                "created_at": Lesson.created_at,
                "updated_at": Lesson.updated_at,
                "quality_score": Lesson.quality_score,
                "title": Lesson.title,
                "duration": Lesson.duration_minutes,
                "cost": Lesson.cost_usd
            }.get(sort_by, Lesson.created_at)
            
            if sort_order == "asc":
                query = query.order_by(asc(sort_column))
            else:
                query = query.order_by(desc(sort_column))
            
            # Apply pagination
            lessons = query.offset(offset).limit(limit).all()
            
            # Convert to dictionaries
            result = []
            for lesson in lessons:
                result.append({
                    "id": str(lesson.id),
                    "timestamp": lesson.created_at.isoformat() if lesson.created_at else None,
                    "query": lesson.topic,
                    "lesson_title": lesson.title,
                    "quality_score": lesson.quality_score,
                    "cost_usd": lesson.cost_usd,
                    "language": lesson.language,
                    "student_level": lesson.student_level,
                    "difficulty_level": lesson.difficulty_level,
                    "duration_minutes": lesson.duration_minutes,
                    "description": lesson.description,
                    "status": lesson.status
                })
            
            return result, total_count
            
        except Exception as e:
            print(f"❌ Failed to get lessons from database: {e}")
            return [], 0
        finally:
            session.close()
    
    def get_lesson(self, lesson_id: str, include_relationships: bool = True) -> Optional[Dict[str, Any]]:
        """
        Get full lesson data by ID.
        
        Args:
            lesson_id: UUID of the lesson
            include_relationships: Whether to include objectives, resources, exercises
            
        Returns:
            Full lesson data or None if not found
        """
        session = self.SessionLocal()
        try:
            lesson = session.query(Lesson).filter(Lesson.id == uuid.UUID(lesson_id)).first()
            
            if not lesson:
                return None
            
            # Log view analytics
            self._log_analytics_event(
                session=session,
                event_type=AnalyticsEventType.LESSON_VIEWED,
                lesson_id=lesson.id
            )
            
            # Convert to dictionary
            return lesson.to_dict(include_relationships=include_relationships)
            
        except Exception as e:
            print(f"❌ Failed to get lesson {lesson_id} from database: {e}")
            return None
        finally:
            session.close()
    
    def delete_lesson(self, lesson_id: str) -> bool:
        """
        Delete a lesson by ID (soft delete by changing status).
        
        Args:
            lesson_id: UUID of the lesson
            
        Returns:
            True if deleted, False if not found
        """
        session = self.SessionLocal()
        try:
            lesson = session.query(Lesson).filter(Lesson.id == uuid.UUID(lesson_id)).first()
            
            if not lesson:
                return False
            
            # Soft delete by changing status
            lesson.status = LessonStatus.DELETED.value
            session.commit()
            
            print(f"🗑️ Lesson marked as deleted: {lesson_id}")
            return True
            
        except Exception as e:
            session.rollback()
            print(f"❌ Failed to delete lesson {lesson_id} from database: {e}")
            return False
        finally:
            session.close()
    
    def search_lessons(
        self, 
        query: str,
        language: Optional[str] = None,
        student_level: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Search lessons by topic, title, or description.
        
        Args:
            query: Search query string
            language: Filter by language
            student_level: Filter by student level
            limit: Maximum results
            
        Returns:
            List of matching lessons
        """
        session = self.SessionLocal()
        try:
            # Build search query (case-insensitive)
            search_query = f"%{query}%"
            db_query = session.query(Lesson).filter(
                and_(
                    Lesson.status == LessonStatus.PUBLISHED.value,
                    or_(
                        Lesson.topic.ilike(search_query),
                        Lesson.title.ilike(search_query),
                        Lesson.description.ilike(search_query)
                    )
                )
            )
            
            if language:
                db_query = db_query.filter(Lesson.language == language)
            if student_level:
                db_query = db_query.filter(Lesson.student_level == student_level)
            
            # Order by relevance (simple - could be improved with full-text search)
            lessons = db_query.order_by(
                desc(Lesson.created_at),
                desc(Lesson.quality_score)
            ).limit(limit).all()
            
            # Convert to dictionaries
            result = []
            for lesson in lessons:
                result.append({
                    "id": str(lesson.id),
                    "title": lesson.title,
                    "topic": lesson.topic,
                    "description": lesson.description[:200] + "..." if len(lesson.description) > 200 else lesson.description,
                    "language": lesson.language,
                    "student_level": lesson.student_level,
                    "difficulty_level": lesson.difficulty_level,
                    "quality_score": lesson.quality_score,
                    "duration_minutes": lesson.duration_minutes,
                    "created_at": lesson.created_at.isoformat() if lesson.created_at else None
                })
            
            return result
            
        except Exception as e:
            print(f"❌ Failed to search lessons: {e}")
            return []
        finally:
            session.close()
    
    def get_lesson_stats(self, days: int = 30) -> Dict[str, Any]:
        """
        Get statistics about stored lessons.
        
        Args:
            days: Number of days to include in time-based stats
            
        Returns:
            Dictionary with various statistics
        """
        session = self.SessionLocal()
        try:
            # Total lessons
            total = session.query(Lesson).filter(
                Lesson.status == LessonStatus.PUBLISHED.value
            ).count()
            
            # Lessons by language
            language_stats = {}
            languages = session.query(
                Lesson.language, 
                func.count(Lesson.id)
            ).filter(
                Lesson.status == LessonStatus.PUBLISHED.value
            ).group_by(Lesson.language).all()
            
            for lang, count in languages:
                language_stats[lang] = count
            
            # Lessons by student level
            level_stats = {}
            levels = session.query(
                Lesson.student_level, 
                func.count(Lesson.id)
            ).filter(
                Lesson.status == LessonStatus.PUBLISHED.value
            ).group_by(Lesson.student_level).all()
            
            for level, count in levels:
                level_stats[level] = count
            
            # Average quality score
            avg_quality = session.query(
                func.avg(Lesson.quality_score)
            ).filter(
                Lesson.status == LessonStatus.PUBLISHED.value
            ).scalar() or 0.0
            
            # Total cost
            total_cost = session.query(
                func.sum(Lesson.cost_usd)
            ).filter(
                Lesson.status == LessonStatus.PUBLISHED.value
            ).scalar() or 0.0
            
            # Recent activity (last N days)
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_count = session.query(Lesson).filter(
                and_(
                    Lesson.status == LessonStatus.PUBLISHED.value,
                    Lesson.created_at >= cutoff_date
                )
            ).count()
            
            # Daily trend (last 7 days)
            daily_trend = []
            for i in range(7):
                day = datetime.now() - timedelta(days=i)
                day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                day_count = session.query(Lesson).filter(
                    and_(
                        Lesson.status == LessonStatus.PUBLISHED.value,
                        Lesson.created_at >= day_start,
                        Lesson.created_at <= day_end
                    )
                ).count()
                
                daily_trend.append({
                    "date": day_start.date().isoformat(),
                    "count": day_count
                })
            
            # Reverse to show chronological order
            daily_trend.reverse()
            
            return {
                "total_lessons": total,
                "by_language": language_stats,
                "by_student_level": level_stats,
                "average_quality": float(avg_quality),
                "total_cost": float(total_cost),
                "recent_activity_days": days,
                "recent_lessons": recent_count,
                "daily_trend": daily_trend,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"❌ Failed to get lesson stats: {e}")
            return {
                "total_lessons": 0,
                "by_language": {},
                "by_student_level": {},
                "average_quality": 0.0,
                "total_cost": 0.0,
                "recent_activity_days": days,
                "recent_lessons": 0,
                "daily_trend": [],
                "timestamp": datetime.now().isoformat()
            }
        finally:
            session.close()
    
    def clear_all_lessons(self):
        """Clear all lessons (for testing only - hard delete)."""
        session = self.SessionLocal()
        try:
            session.query(Lesson).delete()
            session.query(LessonObjective).delete()
            session.query(LessonResource).delete()
            session.query(LessonExercise).delete()
            session.commit()
            print("🧹 All lessons cleared from database")
        except Exception as e:
            session.rollback()
            print(f"❌ Failed to clear lessons: {e}")
        finally:
            session.close()
    
    def _log_analytics_event(
        self, 
        session: Session,
        event_type: str,
        user_id: Optional[uuid.UUID] = None,
        lesson_id: Optional[uuid.UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log an analytics event."""
        try:
            event = AnalyticsEvent(
                event_type=event_type,
                user_id=user_id,
                lesson_id=lesson_id,
                metadata=metadata or {}
            )
            session.add(event)
            session.commit()
        except Exception as e:
            print(f"⚠️ Failed to log analytics event: {e}")
            session.rollback()


# Global PostgreSQL storage instance
lesson_storage_sql = LessonStorageSQL()


def test_database_storage():
    """Test the PostgreSQL storage system."""
    print("🧪 Testing PostgreSQL lesson storage...")
    
    storage = LessonStorageSQL()
    
    # Create a test lesson
    test_lesson = {
        "success": True,
        "language": Language.CHINESE.value,
        "topic": "Python编程测试",
        "class_title": "Python编程入门测试课程",
        "class_description": "这是一个测试课程，用于验证PostgreSQL存储系统",
        "student_level": StudentLevel.BEGINNER.value,
        "difficulty_level": DifficultyLevel.MEDIUM.value,
        "duration_minutes": 30,
        "learning_objectives": ["测试目标1", "测试目标2", "测试目标3"],
        "resources": ["测试资源1", "测试资源2"],
        "exercises": ["测试练习1", "测试练习2"],
        "quality_score": 0.95,
        "cost_usd": 0.001,
        "ai_insights": {
            "generated": True,
            "method": "ai_structured",
            "confidence": 0.95,
            "ai_provider": "DeepSeek"
        }
    }
    
    try:
        # Save the lesson
        saved_info = storage.save_lesson(test_lesson)
        print(f"✅ Lesson saved to PostgreSQL: {saved_info['id']}")
        print(f"   Title: {saved_info['title']}")
        print(f"   Quality: {saved_info['quality_score']}")
        print(f"   Cost: ${saved_info['cost_usd']}")
        
        # Get all lessons
        all_lessons, total = storage.get_all_lessons()
        print(f"📊 Total lessons in database: {total}")
        
        # Get specific lesson
        lesson_data = storage.get_lesson(saved_info['id'])
        print(f"📋 Full lesson data retrieved: {lesson_data is not None}")
        
        if lesson_data:
            print(f"   Objectives: {len(lesson_data.get('objectives', []))}")
            print(f"   Resources: {len(lesson_data.get('resources', []))}")
            print(f"   Exercises: {len(lesson_data.get('exercises', []))}")
        
        # Test search
        search_results = storage.search_lessons("Python")
        print(f"🔍 Search results for 'Python': {len(search_results)}")
        
        # Test stats
        stats = storage.get_lesson_stats(days=7)
        print(f"📈 Lesson stats - Total: {stats['total_lessons']}")
        print(f"   By language: {stats['by_language']}")
        print(f"   Daily trend: {len(stats['daily_trend'])} days")
        
        # Clean up
        storage.delete_lesson(saved_info['id'])
        print(f"🧹 Test cleanup completed - deleted lesson {saved_info['id']}")
        
        print("🎉 PostgreSQL storage test successful!")
        
    except Exception as e:
        print(f"❌ PostgreSQL storage test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Initialize database first
    from .base import init_database
    if init_database():
        test_database_storage()