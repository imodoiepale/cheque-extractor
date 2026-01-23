# OCR Check Processing System - Complete Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Supabase account (free tier works)
- Google Cloud account (for Gemini API)
- QuickBooks Developer account (optional)

---

## 📋 Step-by-Step Setup

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 2. Configure Environment Variables

#### Frontend Environment Variables
Create `frontend/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:3090
```

#### Backend Environment Variables
Create `backend/.env`:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Google Gemini API (Get from: https://makersuite.google.com/app/apikey)
VISION_API_KEY=your-google-gemini-api-key
VISION_API_PROJECT_ID=your-project-id

# Server Configuration
PORT=3090
NODE_ENV=development
CORS_ORIGIN=http://localhost:3080

# Processing Config
MAX_FILE_SIZE=10485760
SUPPORTED_FORMATS=pdf,png,jpg,jpeg
OCR_LANGUAGE=eng
CONFIDENCE_THRESHOLD_AUTO=0.90
CONFIDENCE_THRESHOLD_REVIEW=0.70

# Redis (for queue - optional for development)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug

# QuickBooks OAuth (optional)
QBO_CLIENT_ID=your-qbo-client-id
QBO_CLIENT_SECRET=your-qbo-client-secret
QBO_ENVIRONMENT=sandbox
QBO_REDIRECT_URI=http://localhost:3080/api/qbo/callback
```

### 3. Set Up Supabase

#### A. Run Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

#### B. Create Storage Bucket Manually (if migrations don't work)

1. Go to Supabase Dashboard → Storage
2. Create new bucket: `check-images`
3. Settings:
   - Public: **No**
   - File size limit: **10 MB**
   - Allowed MIME types: `image/jpeg, image/png, image/jpg, application/pdf`

#### C. Set Up Storage Policies

The migrations should create these automatically, but verify in Supabase Dashboard → Storage → Policies.

### 4. Install Tesseract OCR

#### Windows
```bash
# Using Chocolatey
choco install tesseract

# Or download from: https://github.com/UB-Mannheim/tesseract/wiki
```

#### macOS
```bash
brew install tesseract
```

#### Linux
```bash
sudo apt-get install tesseract-ocr
```

### 5. Get API Keys

#### Google Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create new API key
3. Copy and add to `backend/.env` as `VISION_API_KEY`

#### QuickBooks OAuth (Optional)
1. Go to [QuickBooks Developer Portal](https://developer.intuit.com/)
2. Create new app
3. Get Client ID and Client Secret
4. Add to `backend/.env`

### 6. Start the Application

#### Development Mode

```bash
# Terminal 1 - Backend (runs on port 3090)
cd backend
npm run dev

# Terminal 2 - Frontend (runs on port 3080)
cd frontend
npm run dev
```

#### Production Mode

```bash
# Build
cd frontend && npm run build
cd ../backend && npm run build

# Start
cd backend && npm start  # Port 3090
cd frontend && npm start # Port 3080
```

### 7. Access the Application

- **Frontend**: http://localhost:3080
- **Backend API**: http://localhost:3090

---

## 🔧 Configuration

### Port Configuration

Ports are configured in:
- Frontend: `package.json` scripts (`-p 3080`)
- Backend: `package.json` scripts (`PORT=3090`) and `.env` file
- Docker: `docker-compose.yml`

### Toast Notifications

Toast notifications are automatically configured using `react-hot-toast`. The `ToastProvider` is added to the root layout.

### AI Key Validation

The system automatically checks for Google Gemini API key on startup. If missing, a warning banner appears with a link to settings.

---

## 📊 Database Schema

The database includes these main tables:
- `tenants` - Multi-tenant support
- `profiles` - User profiles linked to auth.users
- `checks` - Check records with extracted data
- `processing_stages` - Real-time processing status
- `audit_logs` - Change tracking
- `export_history` - Export records
- `qbo_connections` - QuickBooks connections
- `team_invitations` - Team member invites
- `tenant_settings` - Tenant-specific settings

All tables have Row Level Security (RLS) enabled.

---

## 🗂️ Storage Buckets

### check-images
- **Purpose**: Store uploaded check images
- **Access**: Private (tenant-isolated)
- **Size Limit**: 10 MB per file
- **Formats**: JPEG, PNG, PDF

---

## 🔌 API Routes

### Frontend API Routes (`/pages/api/`)

These Next.js API routes act as a proxy to the backend:

- `POST /api/upload` - Upload check image
- `POST /api/process/[id]` - Trigger processing
- `GET /api/checks` - List checks
- `GET /api/checks/[id]` - Get check details
- `PATCH /api/checks/[id]` - Update check
- `DELETE /api/checks/[id]` - Delete check
- `POST /api/checks/[id]/approve` - Approve check
- `GET /api/settings/integrations` - Get integration status
- `PATCH /api/settings/integrations` - Update API keys
- `GET /api/qbo/auth` - Initiate QBO OAuth
- `GET /api/qbo/callback` - QBO OAuth callback
- `POST /api/qbo/disconnect` - Disconnect QBO
- `POST /api/export/qbo` - Export to QuickBooks
- `POST /api/export/csv` - Export to CSV
- `GET /api/team/members` - List team members
- `POST /api/team/invite` - Invite team member
- `PATCH /api/team/members/[id]` - Update member
- `DELETE /api/team/members/[id]` - Remove member

---

## 🧪 Testing

### Test OCR
```bash
cd backend
npm run test:ocr
```

### Test AI
```bash
cd backend
npm run test:ai
```

### Run Full Test Suite
```bash
cd backend
npm test
```

---

## 🐛 Troubleshooting

### TypeScript Errors
All TypeScript errors about missing modules will resolve after running `npm install` in both frontend and backend directories.

### Tesseract Not Found
Ensure Tesseract is installed and in your PATH:
```bash
tesseract --version
```

### Supabase Connection Issues
1. Verify your Supabase URL and keys in `.env` files
2. Check that RLS policies are enabled
3. Ensure storage bucket exists

### Port Already in Use
```bash
# Kill process on port 3080
npx kill-port 3080

# Kill process on port 3090
npx kill-port 3090
```

### AI Key Not Working
1. Verify the key is correct in Settings → Integrations
2. Check backend logs for API errors
3. Ensure you have Gemini API enabled in Google Cloud

---

## 📝 First-Time Setup Checklist

- [ ] Node.js 18+ installed
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Backend dependencies installed (`npm install`)
- [ ] Tesseract OCR installed
- [ ] Supabase project created
- [ ] Database migrations run
- [ ] Storage bucket created
- [ ] Frontend `.env.local` configured
- [ ] Backend `.env` configured
- [ ] Google Gemini API key obtained and configured
- [ ] Backend started on port 3090
- [ ] Frontend started on port 3080
- [ ] Can access http://localhost:3080
- [ ] Can sign up/login
- [ ] AI key configured in Settings → Integrations

---

## 🚢 Deployment

### Using Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

1. Build both applications
2. Set production environment variables
3. Deploy backend to your server (port 3090)
4. Deploy frontend to Vercel/Netlify or your server (port 3080)
5. Update CORS_ORIGIN in backend to match frontend URL
6. Update NEXT_PUBLIC_BACKEND_URL in frontend to match backend URL

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Google Gemini API](https://ai.google.dev/docs)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
- [QuickBooks API](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [Next.js Documentation](https://nextjs.org/docs)

---

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review backend logs for errors
3. Verify all environment variables are set correctly
4. Ensure all dependencies are installed

---

**System is now ready to process checks! 🎉**
