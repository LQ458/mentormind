"""
One-time migration: fix orphaned user_id references after Clerk → Better Auth migration.

After the auth migration (commit c8046c2, May 24 2026), user IDs changed from
raw Clerk IDs (``user_2abc123...``) to deterministic UUID5 IDs.  Study plans,
board sessions, and knowledge graph records created before the migration still
reference the old user IDs, making them invisible to the user.

This script uses the same UUID5 derivation logic as auth.py and storage.py to
map old-style IDs to new-style IDs and update all referencing tables.
"""

import sys
import uuid
from sqlalchemy import text
from database.base import engine

# Same namespace used in auth.py and storage.py
_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def _is_likely_uuid(candidate: str) -> bool:
    try:
        uuid.UUID(candidate)
        return True
    except (ValueError, AttributeError):
        return False


def _to_new_id(old_id: str) -> str:
    """Convert any user ID to the new UUID5 format."""
    try:
        uuid.UUID(old_id)
        return old_id  # Already a valid UUID
    except (ValueError, AttributeError):
        return str(uuid.uuid5(_NAMESPACE, old_id))


def _find_migration_targets(conn):
    """Find users with old-format IDs and compute their new UUID5 IDs.

    Returns a dict mapping old_id → new_id for users that need updating.
    """
    mapping = {}
    rows = conn.execute(text("SELECT id FROM users")).fetchall()
    for (user_id,) in rows:
        user_id_str = str(user_id) if user_id else ""
        if not _is_likely_uuid(user_id_str):
            new_id = _to_new_id(user_id_str)
            if new_id != user_id_str:
                mapping[user_id_str] = new_id
    return mapping


def migrate():
    print("🔍 Finding users with old-format (non-UUID) IDs...")

    with engine.connect() as conn:
        mapping = _find_migration_targets(conn)
        if not mapping:
            print("✅ No users with old-format IDs found. Nothing to migrate.")
            return

        print(f"📝 Found {len(mapping)} users needing ID migration:")
        for old_id, new_id in mapping.items():
            print(f"   {old_id[:32]}... → {new_id}")

        tables = [
            "study_plans",
            "study_plan_units",
            "board_sessions",
            "kg_concepts",
            "kg_relationships",
            "lessons",
            "student_performance",
            "subject_proficiency",
            "user_profiles",
            "user_media_context",
            "telemetry_events",
            "survey_responses",
        ]

        print("\n📝 Updating referencing tables...")
        for table in tables:
            for old_id, new_id in mapping.items():
                try:
                    result = conn.execute(
                        text(f"UPDATE {table} SET user_id = :new WHERE user_id = :old"),
                        {"new": new_id, "old": old_id},
                    )
                    rowcount = result.rowcount
                    if rowcount > 0:
                        print(f"   {table}: {rowcount} row(s) updated")
                        conn.commit()
                except Exception as exc:
                    print(f"   ⚠️ {table}: skipped ({exc})")
                    conn.rollback()

        # Update the users table itself — convert old IDs to UUID5
        print("\n📝 Updating users table...")
        for old_id, new_id in mapping.items():
            try:
                conn.execute(
                    text("UPDATE users SET id = :new WHERE id = :old"),
                    {"new": new_id, "old": old_id},
                )
                conn.commit()
                print(f"   users: {old_id[:32]}... → {new_id} ✅")
            except Exception as exc:
                print(f"   users: {old_id[:32]}... failed ({exc})")
                conn.rollback()

    print("\n🏁 Migration completed.")


if __name__ == "__main__":
    migrate()
