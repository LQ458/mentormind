#!/bin/bash

# MentorMind PostgreSQL Setup Script
# This script helps set up PostgreSQL for development

set -e

echo "🚀 Setting up PostgreSQL for MentorMind..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop from:"
    echo "   https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    echo "   If Docker Desktop is installed, open it from Applications."
    exit 1
fi

echo "✅ Docker is installed and running"

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ docker-compose is not available."
    echo "   Docker Desktop should include docker-compose."
    exit 1
fi

echo "✅ docker-compose is available"

# Create necessary directories
mkdir -p backend/data

echo "📦 Starting PostgreSQL with Docker Compose..."
$DOCKER_COMPOSE up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if docker exec mentormind-postgres pg_isready -U mentormind &> /dev/null; then
        echo "✅ PostgreSQL is ready!"
        
        # Test connection
        echo "🔧 Testing database connection..."
        if docker exec mentormind-postgres psql -U mentormind -d mentormind_metadata -c "SELECT 1;" &> /dev/null; then
            echo "✅ Database connection successful!"
            
            # Create tables using Python
            echo "🗄️  Creating database tables..."
            cd backend && python -c "
from database import init_database
if init_database():
    print('✅ Database tables created successfully!')
else:
    print('❌ Failed to create tables')
            "
            
            echo ""
            echo "🎉 PostgreSQL setup complete!"
            echo ""
            echo "📊 Database Information:"
            echo "   Host: localhost:5432"
            echo "   Database: mentormind_metadata"
            echo "   Username: mentormind"
            echo "   Password: mentormind"
            echo ""
            echo "🚀 To start the backend with PostgreSQL:"
            echo "   cd /Users/LeoQin/Documents/GitHub/mentormind"
            echo "   python backend/server.py"
            echo ""
            echo "🛑 To stop PostgreSQL:"
            echo "   docker-compose down"
            exit 0
        fi
    fi
    sleep 1
done

echo "❌ PostgreSQL failed to start within 30 seconds"
echo "   Check Docker logs: docker logs mentormind-postgres"
exit 1