# 🔧 Railway Deployment Fix

## ❌ Problem

Railway deployment failed with error:
```
The executable `npm` could not be found.
```

## 🔍 Root Cause

Railway detected the root `package.json` file and tried to use npm/Node.js build process, but the backend is a **Python application** that should use the Dockerfile only.

## ✅ Solution Applied

### 1. **Updated `.railwayignore`**
Added `package.json` and `package-lock.json` to prevent Railway from detecting them:

```
package.json
package-lock.json
```

### 2. **Created `nixpacks.toml`**
Explicitly tells Railway to skip npm build phases:

```toml
[phases.setup]
nixPkgs = []

[phases.install]
cmds = []

[phases.build]
cmds = []

[start]
cmd = "python api_server.py"
```

### 3. **Updated `railway.toml`**
Removed redundant `startCommand` (Dockerfile CMD is used):

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "docker/Dockerfile.backend"

[deploy]
numReplicas = 1
sleepApplication = false
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[deploy.healthcheck]]
path = "/api/health"
port = 3090
```

### 4. **Updated `railway.json`**
Added healthcheck configuration:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "docker/Dockerfile.backend"
  },
  "deploy": {
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100
  }
}
```

---

## 🚀 Deploy Now

### Step 1: Commit and Push
```bash
git add .
git commit -m "Fix Railway deployment - use Dockerfile only"
git push origin main
```

### Step 2: Railway Will Auto-Deploy
Railway will detect the changes and automatically redeploy.

### Step 3: Monitor Deployment
Watch the Railway dashboard for:
- ✅ Build phase completes (using Dockerfile)
- ✅ Deploy phase starts
- ✅ Health check passes at `/api/health`
- ✅ Container starts successfully

---

## 📊 Expected Build Process

```
1. Load Dockerfile (docker/Dockerfile.backend)
2. Build Python 3.11 image
3. Install system dependencies (Tesseract, Poppler)
4. Install Python packages from requirements.txt
5. Copy backend code
6. Create uploads/output directories
7. Set up non-root user
8. Export image
9. Start container with: python api_server.py
10. Health check at /api/health
11. ✅ Deployment successful
```

---

## 🔐 Environment Variables to Set in Railway

After deployment succeeds, add these in Railway dashboard:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# QuickBooks OAuth (after creating Intuit app)
INTUIT_CLIENT_ID=your_client_id
INTUIT_CLIENT_SECRET=your_client_secret
INTUIT_REDIRECT_URI=https://your-railway-url.up.railway.app/api/qbo/callback
FRONTEND_URL=https://your-railway-url.up.railway.app

# Optional (can be set via UI later)
GEMINI_API_KEY=your_gemini_key

# Server
PORT=3090
```

---

## ✅ Verification Steps

Once deployed:

### 1. Check Health Endpoint
```bash
curl https://your-railway-url.up.railway.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-20T11:30:00.000000"
}
```

### 2. Check API Docs
Visit: `https://your-railway-url.up.railway.app/docs`

You should see the FastAPI Swagger documentation.

### 3. Test OAuth Endpoint
```bash
curl https://your-railway-url.up.railway.app/api/qbo/status
```

Expected response:
```json
{
  "connected": false,
  "companyId": null
}
```

---

## 🐛 Troubleshooting

### If build still fails:

1. **Check Railway Logs**
   - Go to Railway dashboard
   - Click on your deployment
   - Check "Build Logs" tab

2. **Verify Dockerfile Path**
   - Ensure `docker/Dockerfile.backend` exists
   - Check file is committed to Git

3. **Clear Railway Cache**
   - In Railway dashboard, go to Settings
   - Click "Clear Build Cache"
   - Redeploy

### If container fails to start:

1. **Check Deploy Logs**
   - Look for Python errors
   - Verify all imports work

2. **Test Locally**
   ```bash
   docker build -f docker/Dockerfile.backend -t backend-test .
   docker run -p 3090:3090 backend-test
   ```

3. **Check Environment Variables**
   - Ensure Supabase credentials are set
   - Verify PORT is set to 3090

---

## 📝 Files Modified

- ✅ `.railwayignore` - Added package.json exclusion
- ✅ `nixpacks.toml` - Created to skip npm phases
- ✅ `railway.toml` - Cleaned up configuration
- ✅ `railway.json` - Added healthcheck settings

---

## 🎯 Next Steps After Successful Deployment

1. ✅ Get your Railway URL
2. ✅ Add environment variables
3. ✅ Create Intuit QuickBooks app
4. ✅ Configure OAuth URLs
5. ✅ Test QuickBooks connection

See `DEPLOYMENT-GUIDE.md` for complete instructions.

---

**The deployment should now work!** 🚀
