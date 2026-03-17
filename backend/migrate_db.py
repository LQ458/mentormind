
import os
import sys
from sqlalchemy import text
from database.base import engine

def migrate():
    """
    Manually add missing columns to the database.
    SQLAlchemy's create_all() does not perform migrations.
    """
    print("🚀 Starting database migration...")
    
    with engine.connect() as conn:
        # Check if user_id column exists in lessons table
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
                # Add the foreign key constraint
                conn.execute(text("ALTER TABLE lessons ADD CONSTRAINT fk_lessons_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;"))
                # Add the index
                conn.execute(text("CREATE INDEX idx_lessons_user_id ON lessons (user_id);"))
                conn.commit()
                print("✅ 'user_id' column added successfully.")
            except Exception as e:
                print(f"❌ Failed to add 'user_id' column: {e}")
                conn.rollback()
        else:
            print("ℹ️ 'user_id' column already exists in 'lessons' table.")

    print("🏁 Migration completed.")

if __name__ == "__main__":
    migrate()
