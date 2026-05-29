#!/bin/bash

# MentorMind Web Setup Script

set -e

echo "========================================="
echo "MentorMind Web Interface Setup"
echo "========================================="

# Check Node.js version
echo "Checking Node.js version..."
node_version=$(node --version 2>&1 | awk '{print $1}')
echo "Node.js version: $node_version"

if [[ "$node_version" < "v18" ]]; then
    echo "Warning: Node.js 18 or higher is recommended"
fi

# Check npm
echo -e "\nChecking npm..."
npm_version=$(npm --version)
echo "npm version: $npm_version"

# Install dependencies
echo -e "\nInstalling dependencies..."
npm install

# Create .env.local if it doesn't exist
echo -e "\nSetting up environment..."
if [ ! -f ".env.local" ]; then
    cat > .env.local << EOF
# MentorMind Web Environment Variables
BACKEND_URL=http://localhost:8000
# Leave blank to use same-origin WebSockets in production
NEXT_PUBLIC_BACKEND_WS_URL=
EOF
    echo "Created .env.local file"
else
    echo ".env.local already exists"
fi

echo -e "\n✅ Setup complete!"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo ""
echo "The web interface will be available at:"
echo "  http://localhost:3000"
echo ""
echo "To build for production:"
echo "  npm run build"
echo "  npm start"
echo ""
echo "========================================="
