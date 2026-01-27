#!/bin/bash

# MentorMind Startup Script
# Simple and clean startup for backend and frontend

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="/Users/LeoQin/Documents/GitHub/mentormind"
WEB_DIR="$PROJECT_DIR/web"

echo -e "${BLUE}🚀 Starting MentorMind...${NC}"
echo "================================"

# Function to check if service is running
check_service() {
    local name=$1
    local port=$2
    local command=$3
    
    if lsof -i :$port > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name already running (port $port)${NC}"
        return 0
    fi
    
    echo -e "${BLUE}Starting $name...${NC}"
    cd "$PROJECT_DIR"
    
    if [ "$name" = "Backend" ]; then
        # Check virtual environment
        if [ ! -d "venv" ]; then
            echo "Creating virtual environment..."
            python3 -m venv venv
        fi
        
        source venv/bin/activate
        
        # Install dependencies if needed
        # pip install fastapi uvicorn python-dotenv aiohttp > /dev/null 2>&1 || true
        if [ -f "backend/requirements.txt" ]; then
            echo "Installing dependencies from backend/requirements.txt..."
            pip install -r backend/requirements.txt > /dev/null 2>&1 || true
        fi

        
        # Start backend
        nohup python3 backend/server.py > backend.log 2>&1 &
    elif [ "$name" = "Frontend" ]; then
        cd "$WEB_DIR"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            pnpm install --silent
        fi
        
        # Start frontend
        nohup pnpm run dev > ../frontend.log 2>&1 &
    fi
    
    # Wait for service to start
    echo "Waiting for $name to start..."
    local attempts=0
    while [ $attempts -lt 15 ]; do
        if lsof -i :$port > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $name started successfully${NC}"
            return 0
        fi
        sleep 2
        attempts=$((attempts + 1))
    done
    
    echo -e "${RED}❌ $name failed to start${NC}"
    return 1
}

# Start backend
check_service "Backend" "8000"

echo ""

# Start frontend  
check_service "Frontend" "3000"

# Check if frontend is actually on port 3001
if ! lsof -i :3000 > /dev/null 2>&1 && lsof -i :3001 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend running on port 3001${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}🎉 MentorMind is running!${NC}"
echo ""
echo "🌐 Frontend: http://localhost:3000 or http://localhost:3001"
echo "🔧 Backend:  http://localhost:8000"
echo ""
echo "📝 Logs:"
echo "  Backend: tail -f $PROJECT_DIR/backend.log"
echo "  Frontend: tail -f $PROJECT_DIR/frontend.log"
echo ""
echo "🛑 Stop all: pkill -f 'server.py\|next'"