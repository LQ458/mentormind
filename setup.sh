#!/bin/bash

# MentorMind Setup Script
# This script helps set up the MentorMind backend service

set -e  # Exit on error

echo "========================================="
echo "MentorMind Backend Service Setup"
echo "========================================="

# Check Python version
echo "Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $python_version"

if [[ "$python_version" < "3.9" ]]; then
    echo "Error: Python 3.9 or higher is required"
    exit 1
fi

# Create virtual environment
echo -e "\nCreating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created"
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo -e "\nActivating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo -e "\nUpgrading pip..."
pip install --upgrade pip

# Install dependencies
echo -e "\nInstalling dependencies..."
pip install -r requirements.txt

# Create .env file from example
echo -e "\nSetting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env file from .env.example"
        echo "Please edit .env file with your API keys and configuration"
    else
        echo "Error: .env.example not found"
        exit 1
    fi
else
    echo ".env file already exists"
fi

# Create necessary directories
echo -e "\nCreating necessary directories..."
mkdir -p data/audio data/videos data/test logs .cache assets

# Create default avatar placeholder
echo -e "\nCreating default avatar placeholder..."
if [ ! -f "assets/teacher_avatar.png" ]; then
    echo "Default avatar image" > assets/teacher_avatar.png
    echo "Created placeholder avatar image"
else
    echo "Avatar image already exists"
fi

# Run tests
echo -e "\nRunning integration tests..."
python test_integration.py

# Run example
echo -e "\nRunning example demonstration..."
python example.py

echo -e "\n========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys:"
echo "   - DEEPSEEK_API_KEY (required)"
echo "   - Other service endpoints (optional)"
echo ""
echo "2. Activate virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "3. Run the system:"
echo "   python example.py"
echo ""
echo "4. Check configuration:"
echo "   python -c \"from config import config; print('Project:', config.PROJECT_NAME)\""
echo ""
echo "Documentation: README.md"
echo "========================================="