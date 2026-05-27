
import os
import sys
from sqlalchemy import text
from database.base import engine

def migrate():
    """
    Manually add missing columns and change types in the database.
    SQLAlchemy's create_all() does not perform migrations.
    """
    print("🚀 Starting database migration...")
    
    with engine.connect() as conn:
        # 1. Identify all tables and columns that reference users.id
        print("🔍 Scanning for foreign key dependencies on 'users.id'...")
        find_fks_query = text("""
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_name
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND ccu.table_name = 'users'
              AND ccu.column_name = 'id';
        """)
        
        dependencies = conn.execute(find_fks_query).fetchall()
        
        # 2. Drop all identifying foreign keys and change their types to VARCHAR
        for table, column, constraint in dependencies:
            print(f"📝 Dropping constraint '{constraint}' on '{table}.{column}'...")
            try:
                conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint};"))
                print(f"📝 Converting '{table}.{column}' to VARCHAR(255)...")
                conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE VARCHAR(255) USING {column}::text;"))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Error updating dependency {table}.{column}: {e}")
                conn.rollback()

        # 3. Convert users.id from UUID to VARCHAR(255)
        print("🔍 Checking 'users.id' column type...")
        check_user_id_type = text("""
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='id';
        """)
        user_id_type = conn.execute(check_user_id_type).fetchone()
        
        if user_id_type and user_id_type[0] == 'uuid':
            print("📝 Converting 'users.id' from UUID to VARCHAR(255)...")
            try:
                conn.execute(text("ALTER TABLE users ALTER COLUMN id TYPE VARCHAR(255) USING id::text;"))
                conn.commit()
                print("✅ 'users.id' converted successfully.")
            except Exception as e:
                print(f"❌ Failed to convert 'users.id': {e}")
                conn.rollback()

        # 4. Add user_id column to lessons table if it doesn't exist
        print("🔍 Checking 'lessons.user_id' column...")
        check_column_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='lessons' AND column_name='user_id';
        """)
        
        result = conn.execute(check_column_query).fetchone()
        
        if not result:
            print("📝 Adding 'user_id' column to 'lessons' table...")
            try:
                conn.execute(text("ALTER TABLE lessons ADD COLUMN user_id VARCHAR(255);"))
                conn.commit()
                print("✅ 'user_id' column added.")
            except Exception as e:
                print(f"❌ Failed to add 'user_id' column: {e}")
                conn.rollback()
        
        # 5. Re-add foreign key constraints
        print("📝 Restoring foreign key constraints...")
        # Add the new lesson FK first
        try:
            conn.execute(text("ALTER TABLE lessons DROP CONSTRAINT IF EXISTS fk_lessons_user;"))
            conn.execute(text("ALTER TABLE lessons ADD CONSTRAINT fk_lessons_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons (user_id);"))
            conn.commit()
            print("✅ 'lessons' foreign key updated.")
        except Exception as e:
            print(f"❌ Failed to update lessons foreign key: {e}")
            conn.rollback()

        # Restore original dependencies
        for table, column, constraint in dependencies:
            print(f"📝 Restoring constraint '{constraint}' on '{table}.{column}'...")
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD CONSTRAINT {constraint} FOREIGN KEY ({column}) REFERENCES users(id) ON DELETE CASCADE;"))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Could not restore constraint {constraint}: {e}")
                conn.rollback()

        # --- Skill-adaptive learning schema additions (idempotent) ---
        print("📝 Applying skill-adaptive learning schema additions...")
        skill_adaptive_ddl = [
            # F1 — UserProfile diagnostic fields
            "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS proficiency_level VARCHAR(20)",
            "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS diagnostic_completed BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS diagnostic_results JSONB DEFAULT '{}'::jsonb",
            # F5 — subject column for per-subject rollup grouping
            "ALTER TABLE student_performance ADD COLUMN IF NOT EXISTS subject VARCHAR(100)",
            "CREATE INDEX IF NOT EXISTS idx_student_performance_subject ON student_performance(subject)",
            # F3 — narration verbosity on lessons
            "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS verbosity VARCHAR(20) DEFAULT 'standard'",
            # F5 — SubjectProficiency table
            """CREATE TABLE IF NOT EXISTS subject_proficiency (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject VARCHAR(100) NOT NULL,
                proficiency_0_to_1 FLOAT NOT NULL DEFAULT 0.5,
                sample_size INTEGER NOT NULL DEFAULT 0,
                last_updated TIMESTAMPTZ DEFAULT NOW(),
                trend VARCHAR(20) NOT NULL DEFAULT 'stable',
                CONSTRAINT uq_subject_proficiency_user_subject UNIQUE (user_id, subject)
            )""",
            "CREATE INDEX IF NOT EXISTS idx_subject_proficiency_user_subject ON subject_proficiency(user_id, subject)",
            # Per-user knowledge graph tables (concepts + relationships extracted from lessons)
            """CREATE TABLE IF NOT EXISTS kg_concepts (
                id UUID PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                normalized_name VARCHAR(200) NOT NULL,
                language VARCHAR(10) NOT NULL DEFAULT 'en',
                level VARCHAR(20),
                subject VARCHAR(80),
                summary TEXT,
                source_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
                lesson_count FLOAT NOT NULL DEFAULT 1.0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_kg_concept_user_norm_lang UNIQUE (user_id, normalized_name, language)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_kg_concepts_user_id ON kg_concepts(user_id)",
            "CREATE INDEX IF NOT EXISTS ix_kg_concepts_normalized_name ON kg_concepts(normalized_name)",
            "CREATE INDEX IF NOT EXISTS ix_kg_concepts_user_subject ON kg_concepts(user_id, subject)",
            """CREATE TABLE IF NOT EXISTS kg_relationships (
                id UUID PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                from_concept_id UUID NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
                to_concept_id UUID NOT NULL REFERENCES kg_concepts(id) ON DELETE CASCADE,
                kind VARCHAR(40) NOT NULL DEFAULT 'related_to',
                weight FLOAT NOT NULL DEFAULT 0.5,
                source_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_kg_rel_unique_edge UNIQUE (user_id, from_concept_id, to_concept_id, kind)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_kg_relationships_user_id ON kg_relationships(user_id)",
            "CREATE INDEX IF NOT EXISTS ix_kg_relationships_from ON kg_relationships(from_concept_id)",
            "CREATE INDEX IF NOT EXISTS ix_kg_relationships_to ON kg_relationships(to_concept_id)",
        ]
        for stmt in skill_adaptive_ddl:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Skill-adaptive DDL failed ({stmt[:60]}…): {e}")
                conn.rollback()
        print("✅ Skill-adaptive schema additions applied.")

        # --- Production-readiness sprint additions: board sessions + telemetry ---
        print("📝 Applying production-readiness schema additions (board_sessions, telemetry_events)...")
        prodready_ddl = [
            # Board lesson auto-save & resume
            """CREATE TABLE IF NOT EXISTS board_sessions (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255),
                plan_id VARCHAR(255),
                unit_id VARCHAR(255),
                topic TEXT,
                title TEXT,
                status VARCHAR(32) DEFAULT 'generating',
                elements JSONB DEFAULT '{}'::jsonb,
                element_order JSONB DEFAULT '[]'::jsonb,
                narration_log JSONB DEFAULT '[]'::jsonb,
                audio_queue JSONB DEFAULT '[]'::jsonb,
                chat_history JSONB DEFAULT '[]'::jsonb,
                last_event_seq INTEGER DEFAULT 0,
                config JSONB DEFAULT '{}'::jsonb,
                board_metadata JSONB DEFAULT '{}'::jsonb,
                conversation_state JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )""",
            # Add board_metadata and conversation_state columns to existing rows
            "ALTER TABLE board_sessions ADD COLUMN IF NOT EXISTS board_metadata JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE board_sessions ADD COLUMN IF NOT EXISTS conversation_state JSONB DEFAULT '[]'::jsonb",
            "CREATE INDEX IF NOT EXISTS idx_board_sessions_user_id ON board_sessions(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_board_sessions_plan_id ON board_sessions(plan_id)",
            "CREATE INDEX IF NOT EXISTS idx_board_sessions_unit_id ON board_sessions(unit_id)",
            "CREATE INDEX IF NOT EXISTS idx_board_sessions_user_plan_unit ON board_sessions(user_id, plan_id, unit_id)",
            "CREATE INDEX IF NOT EXISTS idx_board_sessions_updated_at ON board_sessions(updated_at)",
            # Telemetry events
            """CREATE TABLE IF NOT EXISTS telemetry_events (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255),
                session_id VARCHAR(255),
                event_type VARCHAR(64),
                page VARCHAR(64),
                url VARCHAR(512),
                latency_ms INTEGER,
                payload JSONB DEFAULT '{}'::jsonb,
                viewport_w INTEGER,
                viewport_h INTEGER,
                user_agent VARCHAR(512),
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_id ON telemetry_events(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_id ON telemetry_events(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_type ON telemetry_events(event_type)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_page ON telemetry_events(page)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at ON telemetry_events(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_created ON telemetry_events(event_type, created_at)",
        ]
        for stmt in prodready_ddl:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Prodready DDL failed ({stmt[:60]}…): {e}")
                conn.rollback()
        print("✅ Production-readiness schema additions applied.")

        # --- In-app survey: first-party storage for feedback responses ---
        print("📝 Applying survey_responses schema additions...")
        survey_ddl = [
            """CREATE TABLE IF NOT EXISTS survey_responses (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255),
                session_id VARCHAR(255),
                exam VARCHAR(64),
                school_year VARCHAR(64),
                prior_tools JSONB DEFAULT '[]'::jsonb,
                likert JSONB DEFAULT '{}'::jsonb,
                pmf_score VARCHAR(32),
                nps INTEGER,
                pain_point TEXT,
                feature_request TEXT,
                other_feedback TEXT,
                contact_email VARCHAR(255),
                language VARCHAR(8),
                derived_session_minutes INTEGER,
                derived_board_lessons INTEGER,
                derived_plans_created INTEGER,
                user_agent VARCHAR(512),
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON survey_responses(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_survey_responses_session_id ON survey_responses(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at ON survey_responses(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_survey_responses_exam ON survey_responses(exam)",
        ]
        for stmt in survey_ddl:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Survey DDL failed ({stmt[:60]}…): {e}")
                conn.rollback()
        print("✅ Survey schema additions applied.")

        # --- Invite codes for internal testing ---
        print("📝 Applying invite_codes schema...")
        invite_ddl = [
            """CREATE TABLE IF NOT EXISTS invite_codes (
                code VARCHAR(255) PRIMARY KEY,
                max_uses INTEGER DEFAULT 0,
                used_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )""",
        ]
        for stmt in invite_ddl:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                print(f"⚠️ Invite DDL failed: {e}")
                conn.rollback()

        # Seed 5 invite codes if table is empty
        import os as _os
        codes_str = _os.getenv("INVITE_CODES", "MM-NX7K-ALPHA-2024,MM-V3TQ-BETA-2025,MM-R8WJ-DELTA-5083,MM-P2HC-SIGMA-3091,MM-F6LN-OMEGA-7610")
        for c in codes_str.split(","):
            c = c.strip()
            if not c:
                continue
            try:
                conn.execute(
                    text("INSERT INTO invite_codes (code, max_uses) VALUES (:code, 0) ON CONFLICT (code) DO NOTHING"),
                    {"code": c},
                )
                conn.commit()
            except Exception:
                conn.rollback()
        print("✅ Invite codes ready.")

    print("🏁 Migration completed.")

if __name__ == "__main__":
    migrate()
