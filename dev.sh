#!/bin/bash

# MentorMind Development Script
# Runs the entire stack with hot-reloading enabled.
# Only rebuilds if dependencies (package.json/requirements.txt) change.

echo "🚀 Starting MentorMind in DEVELOPMENT mode..."
echo "📦 Hot-reloading enabled for Frontend & Backend."
echo "🛠️  Checking for environment variables..."

if [ ! -f .env ]; then
    echo "⚠️  .env file not found! Copying from .env.example..."
    cp .env.example .env
fi

# Run docker-compose with the dev override
docker compose -f docker-compose.yml -f docker-compose.dev.yml up "$@"
