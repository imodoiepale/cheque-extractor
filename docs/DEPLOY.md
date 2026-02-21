# CheckPro — Railway Deployment Guide

One-click deployment to Railway with automatic builds and environment configuration.

---

## Prerequisites

- Railway account (free tier works): [railway.app](https://railway.app)
- Supabase project: [supabase.com](https://supabase.com)
- Google Gemini API key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- GitHub repository (this repo)

---

## One-Click Railway Deployment

### Option 1: Deploy Backend Only (Recommended)

Deploy the Python backend to Railway and host the frontend on Vercel for optimal performance.

#### Step 1: Deploy Backend to Railway

1. **Create New Project**
   - Go to [railway.app/new](https://railway.app/new)
   - Click "Deploy from GitHub repo"
   - Select this repository
   - Railway will auto-detect the Dockerfile

2. **Configure Environment Variables**
   
   Go to your service → Variables → Add these:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GEMINI_API_KEYS=key1,key2,key3
   PORT=3090
   PYTHONUNBUFFERED=1
   ```

3. **Generate Domain**
   - Go to Settings → Networking → Generate Domain
   - Copy the URL (e.g., `https://your-app.up.railway.app`)

4. **Verify Deployment**
   - Visit `https://your-app.up.railway.app/api/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

#### Step 2: Deploy Frontend to Vercel

1. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import this GitHub repo
   - Set Root Directory: `frontend`
   - Framework Preset: Next.js

2. **Configure Environment Variables**

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_BACKEND_URL=https://your-app.up.railway.app
   ```

3. **Deploy**
   - Click Deploy
   - Wait for build to complete
   - Visit your Vercel URL

---

### Option 2: Deploy Both Services on Railway

Deploy both backend and frontend as separate Railway services.

#### Step 1: Deploy Backend

Follow "Option 1: Step 1" above.

#### Step 2: Deploy Frontend

1. **Add New Service**
   - In your Railway project → New → GitHub Repo
   - Select the same repository
   - Railway will create a second service

2. **Configure Build**
   - Go to Settings → Build
   - Set Dockerfile Path: `docker/Dockerfile.frontend`
   - Set Root Directory: `/`

3. **Configure Environment Variables**

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_BACKEND_URL=${{backend.RAILWAY_PUBLIC_DOMAIN}}
   NODE_ENV=production
   PORT=3080
   ```

   **Note**: `${{backend.RAILWAY_PUBLIC_DOMAIN}}` automatically references your backend service URL.

4. **Generate Domain**
   - Settings → Networking → Generate Domain
   - This is your app URL

---

## Railway Configuration Files

The repo includes Railway-specific files:

| File | Purpose |
|------|---------|
| `railway.toml` | Build and deploy configuration |
| `railway.json` | Service metadata |
| `.railwayignore` | Files to exclude from build |

---

## Environment Variables Reference

### Backend (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (secret) | `eyJhbGc...` |
| `GEMINI_API_KEYS` | Gemini API keys (comma-separated) | `key1,key2,key3` |
| `PORT` | Backend port | `3090` |

### Backend (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `REQUIRE_AUTH` | Enable JWT auth | `false` |
| `SUPABASE_JWT_SECRET` | JWT secret for auth | (from Supabase) |

### Frontend (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | `eyJhbGc...` |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL | `https://your-app.up.railway.app` |

---

## Database Setup (Supabase)

Before deploying, set up your Supabase database:

### Step 1: Run Migrations

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. Run `supabase/migrations/001_schema.sql` (for fresh projects)
3. Or run `supabase/migrations/002_patches.sql` (for existing projects)

### Step 2: Create Storage Bucket

1. Go to Storage → Create bucket
2. Name: `checks`
3. Public: **Yes**
4. File size limit: 50 MB
5. Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`

### Step 3: Verify Tables

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

## Post-Deployment Checklist

- [ ] Backend health check returns 200: `/api/health`
- [ ] Frontend loads without errors
- [ ] Can sign up / log in (Supabase Auth)
- [ ] Can upload a PDF
- [ ] PDF processing completes successfully
- [ ] Can view extracted cheques in dashboard
- [ ] Can export to CSV
- [ ] Images load correctly (from Supabase Storage)

---

## Troubleshooting

### Backend fails to start

**Check logs**: Railway Dashboard → your service → Deployments → View Logs

Common issues:
- Missing environment variables → Add them in Settings → Variables
- Tesseract not found → Dockerfile should install it automatically
- Port mismatch → Ensure `PORT=3090` is set

### Frontend can't reach backend

**Issue**: CORS errors or 404s when calling API

**Fix**:
1. Verify `NEXT_PUBLIC_BACKEND_URL` is set correctly
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
2. Verify Gemini API key is valid: `GEMINI_API_KEYS`
3. Ensure Supabase service role key has write permissions
4. Check if Tesseract is installed: logs should show "✓ Tesseract found"

---

## Scaling & Performance

### Backend Scaling

Railway auto-scales based on CPU/memory usage. For high-volume processing:

1. **Upgrade Plan**: Railway Pro ($20/mo) for better resources
2. **Add Replicas**: Settings → Scaling → Replicas (Pro plan)
3. **Optimize Gemini**: Use multiple API keys for rate limit rotation

### Frontend Scaling

Vercel auto-scales globally. No configuration needed.

### Database Scaling

Supabase free tier: 500 MB storage, 2 GB bandwidth/month.

For production:
- Upgrade to Supabase Pro ($25/mo): 8 GB storage, 50 GB bandwidth
- Enable connection pooling for high traffic

---

## Cost Estimate

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Railway** (Backend) | $5 credit/month | $20/mo (Pro) |
| **Vercel** (Frontend) | 100 GB bandwidth | $20/mo (Pro) |
| **Supabase** (DB + Storage) | 500 MB storage | $25/mo (Pro) |
| **Gemini API** | 15 req/min free | Pay-as-you-go |

**Total for small projects**: Free (within limits)  
**Total for production**: ~$45-65/month

---

## Alternative: Self-Hosted (Docker)

If you prefer to host on your own VPS:

```bash
cd docker
cp ../.env.example .env
# Edit .env with your credentials
docker compose up --build -d
```

Runs both services on one server:
- Frontend: http://localhost:3080
- Backend: http://localhost:3090

---

## Support

- **Documentation**: See `README.md` for full setup guide
- **Issues**: [GitHub Issues](https://github.com/imodoiepale/cheque-extractor/issues)
- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
