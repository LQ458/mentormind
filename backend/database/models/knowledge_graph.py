"""
Per-user knowledge graph models.

Each lesson can extract concepts and relationships into the user's personal
graph so we can later visualize what they have studied and recommend
prerequisites based on real history (not the hard-coded GraphRAG demo).
"""

import uuid
from sqlalchemy import (
    Column, String, Float, DateTime, Text, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from ..base import Base


class KGConcept(Base):
    """A concept extracted from one of the user's lessons.

    Dedupe key is (user_id, normalized_name, language) so the same idea
    seen across multiple lessons collapses into one node and accumulates
    a list of source lessons via KGConceptLessonLink.
    """

    __tablename__ = "kg_concepts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    normalized_name = Column(String(200), nullable=False, index=True)
    language = Column(String(10), nullable=False, default="en")
    level = Column(String(20), nullable=True)  # beginner | intermediate | advanced
    subject = Column(String(80), nullable=True)
    summary = Column(Text, nullable=True)
    source_lesson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    lesson_count = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "normalized_name", "language", name="uq_kg_concept_user_norm_lang"),
        Index("ix_kg_concepts_user_subject", "user_id", "subject"),
    )


class KGRelationship(Base):
    """An edge between two concepts in a user's graph."""

    __tablename__ = "kg_relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    from_concept_id = Column(UUID(as_uuid=True), ForeignKey("kg_concepts.id", ondelete="CASCADE"), nullable=False, index=True)
    to_concept_id = Column(UUID(as_uuid=True), ForeignKey("kg_concepts.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(40), nullable=False, default="related_to")  # contains | prerequisite | related_to | example_of | contrasts
    weight = Column(Float, nullable=False, default=0.5)
    source_lesson_id = Column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "from_concept_id", "to_concept_id", "kind", name="uq_kg_rel_unique_edge"),
    )
