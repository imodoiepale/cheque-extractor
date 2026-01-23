#!/bin/bash

set -e

echo "🧪 Running all tests..."
echo ""

# Frontend tests
echo "📱 Frontend tests..."
cd frontend
npm test
cd ..

echo ""

# Backend tests
echo "⚙️  Backend tests..."
cd backend
npm test
cd ..

echo ""
echo "✅ All tests completed!"