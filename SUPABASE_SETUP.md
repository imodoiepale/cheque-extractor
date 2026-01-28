# 🗄️ Supabase Database Setup Guide

## 📋 **What You Have**

Your project has **14 migration files** ready to create all database tables, functions, and policies:

1. `20240123000001_initial_schema.sql` - Legacy initial schema
2. `20240123000002_storage_buckets.sql` - Storage setup
3. `20260101000000_enable_extensions.sql` - PostgreSQL extensions
4. `20260101000001_create_tenants.sql` - Tenants table
5. `20260101000002_create_checks.sql` - Checks table
6. `20260101000003_create_processing_stages.sql` - Processing stages
7. `20260101000004_create_audit_logs.sql` - Audit logs
8. `20260101000005_create_export_history.sql` - Export history
9. `20260101000006_create_qbo_connections.sql` - QuickBooks connections
10. `20260101000007_create_user_profiles.sql` - User profiles
11. `20260101000008_create_analytics_views.sql` - Analytics views
12. `20260101000009_create_indexes.sql` - Database indexes
13. `20260101000010_add_rls_policies.sql` - Row Level Security
14. `20260101000011_create_functions.sql` - Database functions
15. `20260101000012_create_triggers.sql` - Database triggers

---

## 🚀 **Option 1: Supabase Dashboard (Easiest)**

### Step 1: Open SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project: `yqbmzerdagqevjdwhlwh`
3. Click **SQL Editor** in the left sidebar

### Step 2: Run Each Migration
For each migration file in order:

1. Open the file in VS Code
2. Copy the entire SQL content
3. Paste into Supabase SQL Editor
4. Click **Run**
5. Wait for "Success" message
6. Move to next file

**Run them in this order:**
```
1. enable_extensions.sql
2. create_tenants.sql
3. create_checks.sql
4. create_processing_stages.sql
5. create_audit_logs.sql
6. create_export_history.sql
7. create_qbo_connections.sql
8. create_user_profiles.sql
9. create_analytics_views.sql
10. create_indexes.sql
11. add_rls_policies.sql
12. create_functions.sql
13. create_triggers.sql
14. storage_buckets.sql (last)
```

---

## 🚀 **Option 2: Supabase CLI (Faster)**

### Prerequisites
Install Supabase CLI:
```powershell
npm install -g supabase
```

### Step 1: Login to Supabase
```powershell
supabase login
```

### Step 2: Link Your Project
```powershell
cd C:\Users\EPALE\Documents\GitHub\cheque-extractor
supabase link --project-ref yqbmzerdagqevjdwhlwh
```

### Step 3: Push All Migrations
```powershell
supabase db push
```

This will run all migrations in order automatically!

---

## 🚀 **Option 3: PowerShell Script (Windows)**

I'll create a PowerShell script to run all migrations:

### Run This Command:
```powershell
cd C:\Users\EPALE\Documents\GitHub\cheque-extractor
.\scripts\setup-database.ps1
```

---

## ✅ **Verify Setup**

After running migrations, verify in Supabase Dashboard:

### Check Tables Created:
1. Go to **Table Editor**
2. You should see:
   - `tenants`
   - `checks`
   - `processing_stages`
   - `audit_logs`
   - `export_history`
   - `qbo_connections`
   - `user_profiles`

### Check Storage Bucket:
1. Go to **Storage**
2. You should see:
   - `check-images` bucket

### Check Functions:
1. Go to **Database** → **Functions**
2. You should see custom functions created

---

## 📝 **What Gets Created**

### Tables:
- **tenants** - Multi-tenant organization data
- **checks** - Check records with extracted data
- **processing_stages** - Processing pipeline stages
- **audit_logs** - Change history and audit trail
- **export_history** - QuickBooks export records
- **qbo_connections** - QuickBooks OAuth tokens
- **user_profiles** - User settings and preferences

### Views:
- **check_processing_stats** - Processing metrics
- **daily_check_volume** - Daily statistics
- **confidence_distribution** - AI confidence metrics

### Functions:
- **create_tenant()** - Create new tenant
- **update_check_status()** - Update check status
- **get_tenant_stats()** - Get tenant statistics
- And more...

### Security:
- **Row Level Security (RLS)** policies on all tables
- Tenant isolation
- User-based access control

---

## 🔧 **Troubleshooting**

### Error: "relation already exists"
Some tables might already exist. You can either:
1. Drop existing tables first (⚠️ deletes data)
2. Skip that migration
3. Use `DROP TABLE IF EXISTS` in migration

### Error: "permission denied"
Make sure you're using the **service role key**, not the anon key.

### Error: "function does not exist"
Run migrations in order - some depend on previous ones.

---

## 🎯 **Recommended: Use Supabase Dashboard**

For first-time setup, I recommend **Option 1 (Dashboard)** because:
- ✅ Visual feedback
- ✅ See errors immediately
- ✅ No CLI installation needed
- ✅ Can review each migration before running

---

**Which option would you like to use? I can help with any of them!**
