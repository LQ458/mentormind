"""
Database Storage Module
PostgreSQL-based storage implementation using SQLAlchemy models
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc, and_, or_

from .base import SessionLocal
from .models.lesson import Lesson, LessonObjective, LessonResource, LessonExercise
from .models.enums import Language, StudentLevel, DifficultyLevel, ResourceType, ExerciseType, LessonStatus
from .models.user import User, UserLesson, StudentPerformance, MemoryReview, AgentInteractionTurn, ProactiveNotification
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
                ai_insights["lesson_plan"] = lesson_data.get("lesson_plan")
                ai_insights["class_description"] = description
            
            # Optional user ownership
            user_id = lesson_data.get("user_id")
            
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
                status=LessonStatus.PUBLISHED.value,
                user_id=user_id if user_id else None,
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
    
    def get_lessons_by_user(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Return all lessons owned by a specific user, newest first."""
        session = self.SessionLocal()
        try:
            lessons = (
                session.query(Lesson)
                .filter(Lesson.user_id == user_id, Lesson.status != LessonStatus.DELETED.value)
                .order_by(Lesson.created_at.desc())
                .limit(limit)
                .all()
            )
            return [l.to_dict(include_relationships=False) for l in lessons]
        finally:
            session.close()

    def get_lesson_state(self, user_id: str, lesson_id: str) -> Dict[str, Any]:
        """Return user-specific lesson progress, latest performance, and next review."""
        session = self.SessionLocal()
        try:
            lesson_uuid = uuid.UUID(lesson_id)
            user_lesson = (
                session.query(UserLesson)
                .filter(UserLesson.user_id == user_id, UserLesson.lesson_id == lesson_uuid)
                .first()
            )
            latest_performance = (
                session.query(StudentPerformance)
                .filter(StudentPerformance.user_id == user_id, StudentPerformance.lesson_id == lesson_uuid)
                .order_by(StudentPerformance.created_at.desc())
                .first()
            )
            review = (
                session.query(MemoryReview)
                .filter(MemoryReview.user_id == user_id, MemoryReview.lesson_id == lesson_uuid)
                .order_by(MemoryReview.due_at.asc())
                .first()
            )
            recent_interactions = (
                session.query(AgentInteractionTurn)
                .filter(AgentInteractionTurn.user_id == user_id, AgentInteractionTurn.lesson_id == lesson_uuid)
                .order_by(AgentInteractionTurn.created_at.desc())
                .limit(12)
                .all()
            )

            interactions_by_type: Dict[str, List[Dict[str, Any]]] = {}
            for item in reversed(recent_interactions):
                interactions_by_type.setdefault(item.interaction_type, []).append(item.to_dict())

            return {
                "progress_percentage": user_lesson.progress_percentage if user_lesson else 0.0,
                "is_completed": user_lesson.is_completed if user_lesson else False,
                "time_spent_minutes": user_lesson.time_spent_minutes if user_lesson else 0,
                "last_accessed_at": user_lesson.last_accessed_at.isoformat() if user_lesson and user_lesson.last_accessed_at else None,
                "latest_performance": latest_performance.to_dict() if latest_performance else None,
                "next_review": review.to_dict() if review else None,
                "recent_interactions_by_type": interactions_by_type,
            }
        finally:
            session.close()

    def upsert_user_lesson_progress(
        self,
        user_id: str,
        lesson_id: str,
        progress_percentage: float,
        is_completed: bool = False,
        time_spent_minutes: int = 0,
    ) -> Dict[str, Any]:
        """Persist progress and schedule first spaced review on completion."""
        session = self.SessionLocal()
        try:
            lesson_uuid = uuid.UUID(lesson_id)
            user_lesson = (
                session.query(UserLesson)
                .filter(UserLesson.user_id == user_id, UserLesson.lesson_id == lesson_uuid)
                .first()
            )
            if not user_lesson:
                user_lesson = UserLesson(user_id=user_id, lesson_id=lesson_uuid)
                session.add(user_lesson)

            user_lesson.progress_percentage = max(0.0, min(float(progress_percentage), 100.0))
            user_lesson.is_completed = bool(is_completed or user_lesson.progress_percentage >= 100.0)
            user_lesson.time_spent_minutes = max(time_spent_minutes, user_lesson.time_spent_minutes or 0)
            user_lesson.last_accessed_at = datetime.now(timezone.utc)

            session.flush()

            if user_lesson.is_completed:
                self._schedule_memory_review(
                    session,
                    user_id=user_id,
                    lesson_id=lesson_uuid,
                    review_type="memory_challenge",
                    score=0.72,
                    confidence=0.68,
                    metadata={"trigger": "lesson_completed"},
                )

            session.commit()
            session.refresh(user_lesson)
            return user_lesson.to_dict()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def record_student_performance(
        self,
        user_id: str,
        lesson_id: str,
        assessment_type: str,
        score: float,
        confidence: float,
        strengths: Optional[List[str]] = None,
        struggles: Optional[List[str]] = None,
        reflection: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Record assessment performance and refresh forgetting-curve scheduling."""
        session = self.SessionLocal()
        try:
            lesson_uuid = uuid.UUID(lesson_id)
            performance = StudentPerformance(
                user_id=user_id,
                lesson_id=lesson_uuid,
                assessment_type=assessment_type,
                score=max(0.0, min(float(score), 1.0)),
                confidence=max(0.0, min(float(confidence), 1.0)),
                strengths=strengths or [],
                struggles=struggles or [],
                reflection=reflection,
                performance_metadata=metadata or {},
            )
            session.add(performance)
            session.flush()

            review = self._schedule_memory_review(
                session,
                user_id=user_id,
                lesson_id=lesson_uuid,
                review_type="memory_challenge",
                score=performance.score,
                confidence=performance.confidence,
                metadata={
                    "trigger": assessment_type,
                    "strengths": strengths or [],
                    "struggles": struggles or [],
                },
            )

            session.commit()
            session.refresh(performance)
            session.refresh(review)
            return {
                "performance": performance.to_dict(),
                "next_review": review.to_dict(),
            }
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_review_queue(self, user_id: str, horizon_hours: int = 168) -> List[Dict[str, Any]]:
        """Return upcoming and due reviews ordered by urgency."""
        session = self.SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            horizon = now + timedelta(hours=horizon_hours)
            reviews = (
                session.query(MemoryReview, Lesson)
                .join(Lesson, Lesson.id == MemoryReview.lesson_id)
                .filter(
                    MemoryReview.user_id == user_id,
                    MemoryReview.status.in_(["scheduled", "due"]),
                    MemoryReview.due_at <= horizon,
                    Lesson.status != LessonStatus.DELETED.value,
                )
                .order_by(MemoryReview.due_at.asc())
                .all()
            )

            queue: List[Dict[str, Any]] = []
            for review, lesson in reviews:
                due_in_hours = (review.due_at - now).total_seconds() / 3600
                stage = "due_now" if due_in_hours <= 0 else "upcoming"
                queue.append({
                    **review.to_dict(),
                    "stage": stage,
                    "due_in_hours": round(due_in_hours, 1),
                    "lesson": {
                        "id": str(lesson.id),
                        "title": lesson.title,
                        "topic": lesson.topic,
                        "language": lesson.language,
                        "duration_minutes": lesson.duration_minutes,
                        "video_url": lesson.ai_insights.get("video_url") if isinstance(lesson.ai_insights, dict) else None,
                    },
                })
            return queue
        finally:
            session.close()

    def sync_proactive_notifications(self, user_id: str, horizon_hours: int = 72) -> List[Dict[str, Any]]:
        """Create in-app notifications from due/upcoming review risks."""
        session = self.SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            horizon = now + timedelta(hours=horizon_hours)
            reviews = (
                session.query(MemoryReview, Lesson)
                .join(Lesson, Lesson.id == MemoryReview.lesson_id)
                .filter(
                    MemoryReview.user_id == user_id,
                    MemoryReview.status.in_(["scheduled", "due"]),
                    MemoryReview.due_at <= horizon,
                    Lesson.status != LessonStatus.DELETED.value,
                )
                .order_by(MemoryReview.due_at.asc())
                .all()
            )

            created: List[Dict[str, Any]] = []
            for review, lesson in reviews:
                existing = (
                    session.query(ProactiveNotification)
                    .filter(
                        ProactiveNotification.user_id == user_id,
                        ProactiveNotification.lesson_id == review.lesson_id,
                        ProactiveNotification.notification_type == review.review_type,
                        ProactiveNotification.status.in_(["unread", "read"]),
                    )
                    .order_by(ProactiveNotification.created_at.desc())
                    .first()
                )
                if existing:
                    existing.notification_metadata = {
                        **(existing.notification_metadata or {}),
                        "review_id": review.id,
                        "trigger": (review.review_metadata or {}).get("trigger"),
                        "mastery": (review.review_metadata or {}).get("mastery"),
                    }
                    existing.scheduled_for = review.due_at
                    continue

                due_in_hours = (review.due_at - now).total_seconds() / 3600
                stage = "due_now" if due_in_hours <= 0 else "upcoming"
                is_chinese = lesson.language == "zh"
                trigger = (review.review_metadata or {}).get("trigger", review.review_type)
                title = (
                    "现在做 3 分钟挑战" if stage == "due_now" and is_chinese else
                    "3-Minute Challenge Due Now" if stage == "due_now" else
                    "即将进入遗忘风险" if is_chinese else
                    "Memory Risk Rising Soon"
                )
                body = (
                    f"现在是回看 {lesson.title} 之前先做主动回忆的最佳时机。"
                    if stage == "due_now" and is_chinese else
                    f"This is the best moment to retrieve {lesson.title} before rewatching."
                    if stage == "due_now" else
                    f"{lesson.title} 即将进入更高遗忘风险，建议先做一次短时检索。"
                    if is_chinese else
                    f"{lesson.title} is approaching a higher forgetting-risk window. A short retrieval pass is recommended."
                )
                notification = ProactiveNotification(
                    user_id=user_id,
                    lesson_id=review.lesson_id,
                    notification_type=review.review_type,
                    title=title,
                    body=body,
                    action_url=f"/lessons/{lesson.id}",
                    status="unread",
                    delivery_channel="in_app",
                    scheduled_for=review.due_at,
                    notification_metadata={
                        "review_id": review.id,
                        "stage": stage,
                        "trigger": trigger,
                        "mastery": (review.review_metadata or {}).get("mastery"),
                    },
                )
                session.add(notification)
                session.flush()
                created.append(notification.to_dict())

            session.commit()
            return created
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 20,
        auto_sync: bool = True,
    ) -> List[Dict[str, Any]]:
        """Return in-app notifications, optionally syncing review-derived items first."""
        if auto_sync:
            try:
                self.sync_proactive_notifications(user_id)
            except Exception as exc:
                print(f"⚠️ Failed to sync proactive notifications for {user_id}: {exc}")

        session = self.SessionLocal()
        try:
            query = session.query(ProactiveNotification).filter(ProactiveNotification.user_id == user_id)
            if unread_only:
                query = query.filter(ProactiveNotification.status == "unread")
            notifications = query.order_by(
                desc(ProactiveNotification.scheduled_for),
                desc(ProactiveNotification.created_at),
            ).limit(limit).all()
            return [item.to_dict() for item in notifications]
        finally:
            session.close()

    def mark_notification_status(self, user_id: str, notification_id: int, status: str) -> Optional[Dict[str, Any]]:
        """Mark a notification as read or dismissed."""
        session = self.SessionLocal()
        try:
            notification = (
                session.query(ProactiveNotification)
                .filter(
                    ProactiveNotification.id == notification_id,
                    ProactiveNotification.user_id == user_id,
                )
                .first()
            )
            if not notification:
                return None

            notification.status = status
            if status == "read":
                notification.read_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(notification)
            return notification.to_dict()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_recent_agent_interactions(
        self,
        user_id: str,
        lesson_id: str,
        interaction_type: Optional[str] = None,
        limit: int = 6,
    ) -> List[Dict[str, Any]]:
        """Return recent stored agent turns for a lesson."""
        session = self.SessionLocal()
        try:
            lesson_uuid = uuid.UUID(lesson_id)
            query = (
                session.query(AgentInteractionTurn)
                .filter(
                    AgentInteractionTurn.user_id == user_id,
                    AgentInteractionTurn.lesson_id == lesson_uuid,
                )
                .order_by(AgentInteractionTurn.created_at.desc())
            )
            if interaction_type:
                query = query.filter(AgentInteractionTurn.interaction_type == interaction_type)
            return [item.to_dict() for item in query.limit(limit).all()]
        finally:
            session.close()

    def store_agent_interaction(
        self,
        user_id: str,
        lesson_id: str,
        interaction_type: str,
        user_input: str,
        agent_output: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Persist one live agent turn for later retrieval and continuity."""
        session = self.SessionLocal()
        try:
            item = AgentInteractionTurn(
                user_id=user_id,
                lesson_id=uuid.UUID(lesson_id),
                interaction_type=interaction_type,
                user_input=user_input,
                agent_output=agent_output or {},
                turn_metadata=metadata or {},
            )
            session.add(item)
            session.commit()
            session.refresh(item)
            return item.to_dict()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _schedule_memory_review(
        self,
        session: Session,
        user_id: str,
        lesson_id: uuid.UUID,
        review_type: str,
        score: float,
        confidence: float,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MemoryReview:
        """Spaced-review scheduler inspired by retrieval practice and the forgetting curve."""
        review = (
            session.query(MemoryReview)
            .filter(
                MemoryReview.user_id == user_id,
                MemoryReview.lesson_id == lesson_id,
                MemoryReview.review_type == review_type,
            )
            .first()
        )

        now = datetime.now(timezone.utc)
        mastery = max(0.0, min((score * 0.7) + (confidence * 0.3), 1.0))

        if not review:
            interval_hours = 48.0 if mastery >= 0.65 else 24.0
            ease_factor = 2.2 if mastery >= 0.8 else 1.7 if mastery >= 0.6 else 1.25
            review = MemoryReview(
                user_id=user_id,
                lesson_id=lesson_id,
                review_type=review_type,
                status="scheduled",
                review_count=1,
                ease_factor=ease_factor,
                interval_hours=interval_hours,
                due_at=now + timedelta(hours=interval_hours),
                last_presented_at=now,
                review_metadata=metadata or {},
            )
            session.add(review)
            return review

        current_interval = max(review.interval_hours, 12.0)
        if mastery >= 0.85:
            new_interval = current_interval * 2.2
            ease_factor = min(review.ease_factor + 0.18, 2.8)
        elif mastery >= 0.7:
            new_interval = current_interval * 1.6
            ease_factor = min(review.ease_factor + 0.08, 2.5)
        elif mastery >= 0.5:
            new_interval = max(18.0, current_interval * 1.15)
            ease_factor = max(review.ease_factor - 0.05, 1.35)
        else:
            new_interval = max(12.0, current_interval * 0.65)
            ease_factor = max(review.ease_factor - 0.2, 1.1)

        review.review_count += 1
        review.ease_factor = ease_factor
        review.interval_hours = round(new_interval, 1)
        review.due_at = now + timedelta(hours=review.interval_hours)
        review.last_presented_at = now
        review.completed_at = now if mastery >= 0.7 else None
        review.status = "scheduled"
        review.review_metadata = {**(review.review_metadata or {}), **(metadata or {}), "mastery": mastery}
        return review

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
