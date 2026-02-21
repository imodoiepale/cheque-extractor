# Railway One-Click Deployment Setup — Complete ✅

All files and configurations are ready for Railway deployment. This document summarizes what was created and how to deploy.

---

## What Was Created

### Railway Configuration Files

| File | Purpose |
|------|---------|
| `railway.toml` | Build and deploy configuration (Dockerfile path, health checks) |
| `railway.json` | Service metadata and schema |
| `.railwayignore` | Files to exclude from deployment (node_modules, .git, etc.) |
| `railway-template.json` | One-click deployment template with environment variables |
| `.env.railway.example` | Railway-specific environment variable template |

### Deployment Documentation

| File | Purpose |
|------|---------|
| `DEPLOY.md` | Comprehensive deployment guide (Railway + Vercel options) |
| `verify-deployment.sh` | Pre-deployment verification script (checks all requirements) |
| `README.md` | Updated with Railway deploy button and deployment links |

### Docker Files (Already Existed)

| File | Purpose |
|------|---------|
| `docker/Dockerfile.backend` | Python backend with Tesseract + Poppler + OpenCV |
| `docker/Dockerfile.frontend` | Next.js frontend with standalone build |
| `docker/docker-compose.yml` | Local development with both services |

### Fixed Issues

| Issue | Fix |
|-------|-----|
| `concurrently` not installed | Added to root `package.json` and ran `npm install` |
| Missing Railway config | Created `railway.toml` and `railway.json` |
| No deployment docs | Created comprehensive `DEPLOY.md` |
| No env var template | Created `.env.railway.example` |

---

## Deployment Options

### Option 1: Backend on Railway + Frontend on Vercel (Recommended)

**Best for**: Production use, optimal performance, automatic scaling

**Steps**:
1. Deploy backend to Railway (Python + Tesseract + Poppler)
2. Deploy frontend to Vercel (Next.js)
3. Connect them via environment variables

**Cost**: Free tier available, ~$5-25/month for production

**Guide**: See `DEPLOY.md` → "Option 1: Deploy Backend Only"

---

### Option 2: Both Services on Railway

**Best for**: Simplicity, single platform management

**Steps**:
1. Deploy backend service to Railway
2. Deploy frontend service to Railway (separate service in same project)
3. Link them using Railway's internal service references

**Cost**: Free tier available, ~$10-30/month for production

**Guide**: See `DEPLOY.md` → "Option 2: Deploy Both Services on Railway"

---

### Option 3: Self-Hosted Docker

**Best for**: Full control, existing VPS/server

**Steps**:
```bash
cd docker
cp ../.env.example .env
# Edit .env with your credentials
docker compose up --build -d
```

**Cost**: Only your VPS cost (~$5-20/month)

**Guide**: See `README.md` → "Docker Deployment"

---

## Quick Start: Deploy to Railway Now

### Step 1: Prepare Your Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "Add Railway deployment configuration"
git push origin main
```

### Step 2: Deploy Backend to Railway

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"**
3. Select this repository
4. Railway will auto-detect the Dockerfile

### Step 3: Configure Environment Variables

In Railway Dashboard → your service → Variables, add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEYS=key1,key2,key3
PORT=3090
PYTHONUNBUFFERED=1
```

### Step 4: Generate Domain

1. Settings → Networking → **Generate Domain**
2. Copy the URL (e.g., `https://checkpro-production.up.railway.app`)

### Step 5: Verify Deployment

Visit: `https://your-app.up.railway.app/api/health`

Should return:
```json
{"status":"ok","timestamp":"2026-02-17T..."}
```

---

## Environment Variables Reference

### Required for Backend

| Variable | Where to Get It | Example |
|----------|-----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role | `eyJhbGc...` |
| `GEMINI_API_KEYS` | [Google AI Studio](https://aistudio.google.com/apikey) | `key1,key2,key3` |

### Optional for Backend

| Variable | Purpose | Default |
|----------|---------|---------|
| `REQUIRE_AUTH` | Enable JWT auth on API endpoints | `false` |
| `SUPABASE_JWT_SECRET` | JWT secret for auth verification | (from Supabase) |

---

## Pre-Deployment Checklist

Run the verification script before deploying:

```bash
bash verify-deployment.sh
```

This checks:
- ✓ All required files exist
- ✓ Environment variables are configured
- ✓ Python dependencies are listed
- ✓ Next.js standalone mode is enabled
- ✓ Supabase migrations are ready
- ✓ Railway configuration is valid
- ✓ Documentation is complete
- ✓ Git repository is clean

---

## Database Setup (Supabase)

Before deploying, set up your Supabase database:

### 1. Run Migrations

Go to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor

**For fresh projects**:
```sql
-- Paste and run: supabase/migrations/001_schema.sql
```

**For existing projects**:
```sql
-- Paste and run: supabase/migrations/002_patches.sql
```

### 2. Create Storage Bucket

1. Go to Storage → Create bucket
2. Name: `checks`
3. Public: **Yes**
4. File size limit: 50 MB
5. Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`

### 3. Verify Tables

Ensure these tables exist:
- `tenants`
- `profiles`
- `tenant_settings`
- `check_jobs`
- `checks`
- `export_history`
- `audit_logs`
- `accounting_connections`
- `team_invitations`

---

## Post-Deployment Verification

After deploying, verify everything works:

### Backend Health Check
```bash
curl https://your-app.up.railway.app/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-02-17T08:30:00.000Z"}
```

### Frontend Access
Visit your frontend URL and verify:
- [ ] Page loads without errors
- [ ] Can sign up / log in
- [ ] Can upload a PDF
- [ ] Processing completes successfully
- [ ] Can view extracted cheques
- [ ] Can export to CSV
- [ ] Images load correctly

---

## Troubleshooting

### Backend fails to start

**Check logs**: Railway Dashboard → Deployments → View Logs

Common issues:
- Missing environment variables → Add them in Settings → Variables
- Tesseract not found → Dockerfile should install it automatically
- Port mismatch → Ensure `PORT=3090` is set

### Frontend can't reach backend

**Issue**: CORS errors or 404s when calling API

**Fix**:
1. Verify `NEXT_PUBLIC_BACKEND_URL` points to your Railway backend URL
2. Ensure backend domain is generated and accessible
3. Check backend logs for incoming requests

### Images not loading

**Issue**: Check images show broken image icon

**Fix**:
1. Verify Supabase Storage bucket `checks` exists and is public
2. Check `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Verify images were uploaded during processing (check backend logs)

### Extraction fails

**Issue**: Jobs stuck in "detecting" or "extracting" status

**Fix**:
1. Check backend logs for errors
2. Verify Gemini API key is valid
3. Ensure Supabase service role key has write permissions
4. Check if Tesseract is installed (logs should show "✓ Tesseract found")

---

## Cost Estimate

| Service | Free Tier | Production |
|---------|-----------|------------|
| **Railway** (Backend) | $5 credit/month | ~$20/month |
| **Vercel** (Frontend) | 100 GB bandwidth | ~$20/month |
| **Supabase** (DB + Storage) | 500 MB storage | ~$25/month |
| **Gemini API** | 15 req/min | Pay-as-you-go |

**Total for small projects**: Free (within limits)  
**Total for production**: ~$45-65/month

---

## Support & Documentation

- **Full Deployment Guide**: `DEPLOY.md`
- **Setup Instructions**: `README.md`
- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Issues**: [GitHub Issues](https://github.com/imodoiepale/cheque-extractor/issues)

---

## Next Steps

1. **Commit and push** all changes to GitHub
2. **Run verification**: `bash verify-deployment.sh`
3. **Set up Supabase** database (run migrations)
4. **Deploy to Railway** following steps above
5. **Configure environment variables**
6. **Test the deployment**

**You're ready to deploy!** 🚀
