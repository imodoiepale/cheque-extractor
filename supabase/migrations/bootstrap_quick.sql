-- ============================================================================
-- QUICK BOOTSTRAP: Run this first to unblock signup.
-- Then run 00000000000000_master_schema.sql for the full schema.
-- Paste this into: https://supabase.com/dashboard/project/_/sql/new
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'member',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tenant Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    default_export_format TEXT DEFAULT 'csv',
    currency    TEXT DEFAULT 'USD',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Check Jobs (one row per PDF)
CREATE TABLE IF NOT EXISTS check_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    job_id          TEXT UNIQUE NOT NULL,
    pdf_name        TEXT NOT NULL,
    pdf_url         TEXT,
    pdf_size        INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending',
    doc_format      TEXT,
    total_pages     INTEGER DEFAULT 0,
    total_checks    INTEGER DEFAULT 0,
    checks_data     JSONB DEFAULT '[]'::jsonb,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile + tenant on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _tenant_id UUID;
    _name TEXT;
BEGIN
    _name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    INSERT INTO tenants (name, slug)
    VALUES (_name || '''s Workspace', lower(replace(_name, ' ', '-')) || '-' || substr(NEW.id::text, 1, 8))
    RETURNING id INTO _tenant_id;
    INSERT INTO profiles (id, tenant_id, email, full_name, role)
    VALUES (NEW.id, _tenant_id, NEW.email, _name, 'admin');
    INSERT INTO tenant_settings (tenant_id) VALUES (_tenant_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_jobs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (so backend + signup trigger work)
CREATE POLICY "service_all_tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_settings" ON tenant_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_jobs" ON check_jobs FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for checks
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('checks', 'checks', true, 52428800, ARRAY['image/jpeg','image/png','image/jpg','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "public_read_checks" ON storage.objects FOR SELECT USING (bucket_id = 'checks');
CREATE POLICY "public_write_checks" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'checks');
CREATE POLICY "public_update_checks" ON storage.objects FOR UPDATE USING (bucket_id = 'checks');
