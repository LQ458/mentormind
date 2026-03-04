"""
Database Base Configuration
Sets up SQLAlchemy engine, session, and base classes
"""

import os
from sqlalchemy import create_engine, text, text
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
    pool_size=db_config.max_connections,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,  # Set to True for SQL debugging
    connect_args={
        "connect_timeout": 10,
        "application_name": "mentormind_backend"
    }
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