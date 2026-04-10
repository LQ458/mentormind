"""
Migration script for Adaptive Learning feature.
Creates study_plans, study_plan_units, and gaokao_sessions tables.

Safe to run multiple times — uses IF NOT EXISTS for all operations.
"""

import os
import sys
from sqlalchemy import text

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.base import engine


def migrate_study_plans():
    """Create tables for the Adaptive Learning feature."""
    print("🚀 Starting study plans migration...")

    with engine.connect() as conn:
        # 1. Create study_plans table
        print("📝 Creating 'study_plans' table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS study_plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(50) NOT NULL,
                framework VARCHAR(50),
                course_name VARCHAR(255),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                language VARCHAR(10) DEFAULT 'zh',
                total_units INTEGER DEFAULT 0,
                estimated_hours FLOAT DEFAULT 0.0,
                difficulty_level VARCHAR(20) DEFAULT 'intermediate',
                diagnostic_context JSONB DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'draft',
                progress_percentage FLOAT DEFAULT 0.0,
                ai_metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            );
        """))
        conn.commit()
        print("✅ 'study_plans' table ready.")

        # Create indexes for study_plans
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans (user_id);",
            "CREATE INDEX IF NOT EXISTS idx_study_plans_subject ON study_plans (subject);",
            "CREATE INDEX IF NOT EXISTS idx_study_plans_status ON study_plans (status);",
            "CREATE INDEX IF NOT EXISTS idx_study_plans_created_at ON study_plans (created_at);",
        ]:
            conn.execute(text(idx_sql))
        conn.commit()

        # 2. Create study_plan_units table
        print("📝 Creating 'study_plan_units' table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS study_plan_units (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
                order_index INTEGER NOT NULL DEFAULT 0,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                topics JSONB DEFAULT '[]',
                learning_objectives JSONB DEFAULT '[]',
                prerequisites JSONB DEFAULT '[]',
                estimated_minutes INTEGER DEFAULT 60,
                content_status VARCHAR(20) DEFAULT 'pending',
                study_guide JSONB,
                quiz JSONB,
                flashcards JSONB,
                formula_sheet JSONB,
                mock_exam JSONB,
                is_completed BOOLEAN DEFAULT FALSE,
                score FLOAT,
                lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            );
        """))
        conn.commit()
        print("✅ 'study_plan_units' table ready.")

        # Create indexes for study_plan_units
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_study_plan_units_plan_id ON study_plan_units (plan_id);",
            "CREATE INDEX IF NOT EXISTS idx_study_plan_units_order ON study_plan_units (plan_id, order_index);",
            "CREATE INDEX IF NOT EXISTS idx_study_plan_units_content_status ON study_plan_units (content_status);",
        ]:
            conn.execute(text(idx_sql))
        conn.commit()

        # 3. Create gaokao_sessions table
        print("📝 Creating 'gaokao_sessions' table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS gaokao_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                plan_id UUID REFERENCES study_plans(id) ON DELETE SET NULL,
                subject VARCHAR(50) NOT NULL,
                topic_focus VARCHAR(255),
                chat_history JSONB DEFAULT '[]',
                resources_found JSONB DEFAULT '[]',
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            );
        """))
        conn.commit()
        print("✅ 'gaokao_sessions' table ready.")

        # Create indexes for gaokao_sessions
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_gaokao_sessions_user_id ON gaokao_sessions (user_id);",
            "CREATE INDEX IF NOT EXISTS idx_gaokao_sessions_plan_id ON gaokao_sessions (plan_id);",
            "CREATE INDEX IF NOT EXISTS idx_gaokao_sessions_subject ON gaokao_sessions (subject);",
            "CREATE INDEX IF NOT EXISTS idx_gaokao_sessions_status ON gaokao_sessions (status);",
        ]:
            conn.execute(text(idx_sql))
        conn.commit()

        # 4. Add difficulty_level column if missing (for existing tables)
        print("📝 Ensuring 'difficulty_level' column exists on study_plans...")
        conn.execute(text("""
            ALTER TABLE study_plans
            ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'intermediate';
        """))
        conn.commit()
        print("✅ 'difficulty_level' column ready.")

    print("🏁 Study plans migration completed successfully.")


if __name__ == "__main__":
    migrate_study_plans()
