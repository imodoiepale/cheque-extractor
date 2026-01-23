#!/bin/bash

set -e

echo "🚀 OCR Check Processor - Setup Script"
echo "======================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm $(npm -v)"

# Redis
if ! command -v redis-cli &> /dev/null; then
    echo "⚠️  Redis is not installed. Install it for queue functionality."
else
    echo "✅ Redis installed"
fi

# Tesseract
if ! command -v tesseract &> /dev/null; then
    echo "⚠️  Tesseract OCR is not installed. Install it for OCR functionality."
else
    echo "✅ Tesseract $(tesseract --version | head -n 1)"
fi

echo ""
echo "📦 Installing dependencies..."

# Root dependencies
echo "Installing root dependencies..."
npm install

# Frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
cd ..

echo ""
echo "🔧 Setting up environment files..."

# Copy environment files
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env"
else
    echo "⚠️  .env already exists"
fi

if [ ! -f frontend/.env.local ]; then
    cp frontend/.env.example frontend/.env.local
    echo "✅ Created frontend/.env.local"
else
    echo "⚠️  frontend/.env.local already exists"
fi

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "✅ Created backend/.env"
else
    echo "⚠️  backend/.env already exists"
fi

echo ""
echo "🗄️  Database setup..."
read -p "Do you want to run Supabase migrations now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v supabase &> /dev/null; then
        cd supabase
        supabase db push
        cd ..
        echo "✅ Migrations completed"
    else
        echo "❌ Supabase CLI not installed. Please install it and run 'supabase db push' manually."
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit .env files with your credentials:"
echo "   - .env"
echo "   - frontend/.env.local"
echo "   - backend/.env"
echo ""
echo "2. Start the development servers:"
echo "   ./scripts/dev.sh"
echo ""
echo "   Or start individually:"
echo "   - Frontend: cd frontend && npm run dev"
echo "   - Backend: cd backend && npm run dev"
echo ""
echo "3. Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend: http://localhost:4000"
echo ""
echo "📚 For more information, see README.md"