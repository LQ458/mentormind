
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
        # 1. Convert users.id from UUID to VARCHAR(255) to support Clerk IDs
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
                # We need to drop dependent foreign keys first if any, 
                # but UserLesson is the only one likely and it might already be empty or not yet using UUIDs
                conn.execute(text("ALTER TABLE user_lessons DROP CONSTRAINT IF EXISTS user_lessons_user_id_fkey;"))
                conn.execute(text("ALTER TABLE users ALTER COLUMN id TYPE VARCHAR(255) USING id::text;"))
                conn.commit()
                print("✅ 'users.id' converted successfully.")
            except Exception as e:
                print(f"❌ Failed to convert 'users.id': {e}")
                conn.rollback()

        # 2. Add user_id column to lessons table
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
                # Add the column
                conn.execute(text("ALTER TABLE lessons ADD COLUMN user_id VARCHAR(255);"))
                conn.commit()
                print("✅ 'user_id' column added.")
            except Exception as e:
                print(f"❌ Failed to add 'user_id' column: {e}")
                conn.rollback()
        
        # 3. Add foreign key and index
        print("📝 Adding foreign key constraint and index...")
        try:
            conn.execute(text("ALTER TABLE lessons DROP CONSTRAINT IF EXISTS fk_lessons_user;"))
            conn.execute(text("ALTER TABLE lessons ADD CONSTRAINT fk_lessons_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons (user_id);"))
            conn.commit()
            print("✅ Foreign key and index updated successfully.")
        except Exception as e:
            print(f"❌ Failed to update foreign key: {e}")
            conn.rollback()

    print("🏁 Migration completed.")

if __name__ == "__main__":
    migrate()
