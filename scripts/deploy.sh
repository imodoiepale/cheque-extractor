#!/bin/bash

set -e

echo "🚢 OCR Check Processor - Deployment Script"
echo "=========================================="
echo ""

# Check environment
if [ -z "$NODE_ENV" ]; then
    echo "⚠️  NODE_ENV not set. Defaulting to 'production'"
    export NODE_ENV=production
fi

echo "Environment: $NODE_ENV"
echo ""

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend built"

# Build backend
echo "📦 Building backend..."
cd backend
npm run build
cd ..
echo "✅ Backend built"

echo ""
echo "✅ Build complete!"
echo ""
echo "📝 Deployment instructions:"
echo ""
echo "Frontend (Vercel):"
echo "  cd frontend && vercel deploy --prod"
echo ""
echo "Backend (Railway/Render):"
echo "  - Push to GitHub"
echo "  - Connect repository to Railway/Render"
echo "  - Set environment variables"
echo "  - Deploy"
echo ""
echo "Docker:"
echo "  docker-compose up -d"