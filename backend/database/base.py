"""
Database Base Configuration
Sets up SQLAlchemy engine, session, and base classes
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from config import config

# Get PostgreSQL configuration
db_config = config.get_databases().get("postgres")

# Construct database URL: prioritize direct DATABASE_URL for Supabase/PaaS
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    if not db_config:
        raise ValueError("PostgreSQL configuration not found in config")
    DB_URL = f"postgresql://{db_config.username}:{db_config.password}@{db_config.host}:{db_config.port}/{db_config.database}"

# Create engine with connection pooling
engine = create_engine(
    DB_URL,
    poolclass=QueuePool,
    pool_size=db_config.max_connections if db_config else 10,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,  # Set to True for SQL debugging
    connect_args={
        "connect_timeout": 10,
        "application_name": "mentormind_backend"
    } if not DB_URL.startswith("postgresql+asyncpg") else {}
)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
    expire_on_commit=False
)

# Base class for all models
Base = declarative_base()


def _apply_additive_runtime_migrations() -> None:
    """Apply tiny additive patches needed before the full migration command runs.

    Production compose still runs migrate_db.py, but local/dev and hand-run VPS
    processes often start server.py directly. create_all() will not add columns
    to existing tables, so keep startup safe for backwards-compatible fields
    that the request path now reads immediately.
    """
    ddl = [
        "ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
        "ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ",
        "CREATE INDEX IF NOT EXISTS idx_study_plans_purge_after ON study_plans(purge_after)",
        "ALTER TABLE study_plan_units ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
        "ALTER TABLE study_plan_units ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ",
        "CREATE INDEX IF NOT EXISTS idx_study_plan_units_purge_after ON study_plan_units(purge_after)",
    ]
    with engine.begin() as conn:
        for statement in ddl:
            conn.execute(text(statement))


def get_db():
    """
    Dependency for FastAPI to get database session.
    Yields a session and ensures it's closed properly.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    """
    Initialize database tables.
    Creates all tables defined in models.
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # Create tables
        Base.metadata.create_all(bind=engine)
        _apply_additive_runtime_migrations()
        print("✅ Database tables created successfully")
        return True
        
    except Exception as e:
        print(f"❌ Failed to initialize database: {e}")
        return False


def drop_database():
    """
    Drop all database tables (for testing only).
    
    Warning: This will delete all data!
    """
    try:
        Base.metadata.drop_all(bind=engine)
        print("🗑️ Database tables dropped")
        return True
    except Exception as e:
        print(f"❌ Failed to drop database: {e}")
        return False


def test_connection() -> bool:
    """
    Test database connection.
    
    Returns:
        bool: True if connection successful, False otherwise
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ Database connection successful")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


# Initialize database on import if in development
if os.getenv("MENTORMIND_ENV", "development") == "development":
    print("🔧 Development environment detected, testing database connection...")
    test_connection()
