#!/bin/bash

set -e

echo "🚀 Starting OCR Check Processor in development mode..."
echo ""

# Check if Redis is running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "⚠️  Redis is not running. Starting Redis..."
    redis-server --daemonize yes
    sleep 2
    echo "✅ Redis started"
else
    echo "✅ Redis is already running"
fi

echo ""
echo "📦 Starting services..."
echo ""

# Use concurrently to run both servers
npx concurrently \
    --names "FRONTEND,BACKEND" \
    --prefix-colors "cyan,magenta" \
    "cd frontend && npm run dev" \
    "cd backend && npm run dev"