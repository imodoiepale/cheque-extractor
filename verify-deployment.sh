#!/bin/bash
# CheckPro Deployment Verification Script

echo "=============================================================="
echo "  CheckPro Deployment Verification"
echo "=============================================================="
echo ""

errors=0
warnings=0

# Check 1: Required files
echo "[1/8] Checking required files..."
files=(
    "backend/api_server.py"
    "backend/check_extractor.py"
    "backend/requirements.txt"
    "frontend/package.json"
    "docker/Dockerfile.backend"
    "docker/Dockerfile.frontend"
    "railway.toml"
    ".env.example"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file MISSING"
        ((errors++))
    fi
done

# Check 2: Environment variables
echo ""
echo "[2/8] Checking environment variables..."
if [ -f ".env" ]; then
    vars=("NEXT_PUBLIC_SUPABASE_URL" "SUPABASE_SERVICE_ROLE_KEY" "GEMINI_API_KEYS")
    for var in "${vars[@]}"; do
        if grep -q "$var" .env; then
            echo "  ✓ $var found"
        else
            echo "  ✗ $var MISSING"
            ((errors++))
        fi
    done
else
    echo "  ⚠ .env file not found (optional for Railway)"
    ((warnings++))
fi

# Check 3: Python dependencies
echo ""
echo "[3/8] Checking Python dependencies..."
if [ -f "backend/requirements.txt" ]; then
    deps=("fastapi" "uvicorn" "opencv-python" "pdf2image" "pytesseract")
    for dep in "${deps[@]}"; do
        if grep -q "$dep" backend/requirements.txt; then
            echo "  ✓ $dep"
        else
            echo "  ✗ $dep MISSING"
            ((errors++))
        fi
    done
fi

# Check 4: Next.js standalone mode
echo ""
echo "[4/8] Checking Next.js configuration..."
if [ -f "frontend/next.config.js" ]; then
    if grep -q "output.*standalone" frontend/next.config.js; then
        echo "  ✓ Standalone mode enabled"
    else
        echo "  ✗ Standalone mode NOT enabled"
        ((errors++))
    fi
fi

# Check 5: Supabase migrations
echo ""
echo "[5/8] Checking Supabase migrations..."
migrations=("supabase/migrations/001_schema.sql" "supabase/migrations/002_patches.sql")
for migration in "${migrations[@]}"; do
    if [ -f "$migration" ]; then
        echo "  ✓ $migration"
    else
        echo "  ✗ $migration MISSING"
        ((errors++))
    fi
done

# Check 6: Railway configuration
echo ""
echo "[6/8] Checking Railway configuration..."
if [ -f "railway.toml" ]; then
    if grep -q "dockerfilePath" railway.toml; then
        echo "  ✓ Dockerfile path configured"
    else
        echo "  ⚠ Dockerfile path not found"
        ((warnings++))
    fi
fi

if [ -f ".railwayignore" ]; then
    echo "  ✓ .railwayignore exists"
else
    echo "  ⚠ .railwayignore not found (optional)"
    ((warnings++))
fi

# Check 7: Documentation
echo ""
echo "[7/8] Checking documentation..."
docs=("README.md" "DEPLOY.md")
for doc in "${docs[@]}"; do
    if [ -f "$doc" ]; then
        echo "  ✓ $doc"
    else
        echo "  ⚠ $doc MISSING"
        ((warnings++))
    fi
done

# Check 8: Git repository
echo ""
echo "[8/8] Checking Git repository..."
if [ -d ".git" ]; then
    echo "  ✓ Git repository initialized"
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        echo "  ⚠ Uncommitted changes detected"
        ((warnings++))
    else
        echo "  ✓ No uncommitted changes"
    fi
else
    echo "  ✗ Not a Git repository"
    ((errors++))
fi

# Summary
echo ""
echo "=============================================================="
echo "  Verification Summary"
echo "=============================================================="

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo "✓ All checks passed! Ready to deploy to Railway."
    echo ""
    echo "Next steps:"
    echo "  1. Push your code to GitHub"
    echo "  2. Go to https://railway.app/new"
    echo "  3. Select 'Deploy from GitHub repo'"
    echo "  4. Configure environment variables (see .env.railway.example)"
    echo "  5. Deploy!"
    exit 0
elif [ $errors -eq 0 ]; then
    echo "⚠ $warnings warning(s) found. Deployment should work but review warnings."
    exit 0
else
    echo "✗ $errors error(s) and $warnings warning(s) found. Fix errors before deploying."
    echo ""
    echo "Refer to DEPLOY.md for setup instructions."
    exit 1
fi
