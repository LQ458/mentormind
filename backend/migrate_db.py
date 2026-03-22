
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

    print("🏁 Migration completed.")

if __name__ == "__main__":
    migrate()
