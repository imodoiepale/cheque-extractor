-- ============================================================================
-- CheckPro: Complete Database Schema
-- Run this on a FRESH Supabase project (SQL Editor → New Query → Paste & Run)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════════════════════
-- Tables (all use IF NOT EXISTS for safe re-runs)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tenants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free','pro','enterprise')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── User Profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin','member','viewer')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Tenant Settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    gemini_api_key_encrypted TEXT,
    default_export_format   TEXT DEFAULT 'csv'
        CHECK (default_export_format IN ('csv','iif','xero','zoho','excel')),
    auto_export_enabled     BOOLEAN DEFAULT false,
    auto_export_threshold   NUMERIC DEFAULT 0.95,
    default_expense_account TEXT DEFAULT 'Uncategorized Expense',
    default_bank_account    TEXT DEFAULT 'Checking',
    currency                TEXT DEFAULT 'USD',
    webhook_url             TEXT,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ── Check Jobs (one row per PDF upload) ─────────────────────
CREATE TABLE IF NOT EXISTS check_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    job_id          TEXT UNIQUE NOT NULL,
    pdf_name        TEXT NOT NULL,
    pdf_url         TEXT,
    pdf_size        INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','detecting','extracting','analyzed','ocr','ocr_running','complete','error')),
    doc_format      TEXT,
    total_pages     INTEGER DEFAULT 0,
    total_checks    INTEGER DEFAULT 0,
    checks_data     JSONB DEFAULT '[]'::jsonb,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT now(),
    file_size       BIGINT
);

CREATE INDEX IF NOT EXISTS idx_check_jobs_job_id ON check_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_check_jobs_status ON check_jobs(status);

-- ── Checks (one row per extracted cheque) ───────────────────
CREATE TABLE IF NOT EXISTS checks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id                  TEXT REFERENCES check_jobs(job_id),
    user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    check_id                TEXT NOT NULL,
    page_number             INTEGER DEFAULT 1,
    check_index             INTEGER DEFAULT 1,
    source_file             TEXT NOT NULL,
    file_url                TEXT,
    image_width             INTEGER,
    image_height            INTEGER,
    status                  TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review','approved','rejected','exported','duplicate','error')),
    -- Extraction fields with confidence
    payee                   TEXT,
    payee_confidence        NUMERIC,
    payee_source            TEXT,
    amount                  NUMERIC,
    amount_raw              TEXT,
    amount_confidence       NUMERIC,
    amount_source           TEXT,
    amount_written          TEXT,
    amount_written_confidence NUMERIC,
    check_date              DATE,
    check_date_raw          TEXT,
    check_date_confidence   NUMERIC,
    check_date_source       TEXT,
    check_number            TEXT,
    check_number_confidence NUMERIC,
    check_number_source     TEXT,
    bank_name               TEXT,
    bank_name_confidence    NUMERIC,
    bank_name_source        TEXT,
    memo                    TEXT,
    memo_confidence         NUMERIC,
    -- MICR
    micr_routing            TEXT,
    micr_routing_confidence NUMERIC,
    micr_account            TEXT,
    micr_account_confidence NUMERIC,
    micr_serial             TEXT,
    micr_raw                TEXT,
    -- Aggregate confidence
    confidence_summary      NUMERIC,
    -- Raw OCR results
    ocr_results             JSONB,
    ai_results              JSONB,
    hybrid_results          JSONB,
    validation_errors       JSONB DEFAULT '[]'::jsonb,
    validation_warnings     JSONB DEFAULT '[]'::jsonb,
    -- Review
    reviewed_by             UUID REFERENCES auth.users(id),
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,
    -- Export
    exported                BOOLEAN DEFAULT false,
    exported_at             TIMESTAMPTZ,
    export_format           TEXT,
    export_batch_id         UUID,
    -- QuickBooks sync
    qbo_synced              BOOLEAN DEFAULT false,
    qbo_transaction_id      TEXT,
    qbo_sync_error          TEXT,
    qbo_synced_at           TIMESTAMPTZ,
    -- Misc
    currency                TEXT DEFAULT 'USD',
    custom_fields           JSONB DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checks_job_check ON checks(job_id, check_id);
CREATE INDEX IF NOT EXISTS idx_checks_job_id ON checks(job_id);
CREATE INDEX IF NOT EXISTS idx_checks_tenant_id ON checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);

-- ── Export History ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id),
    job_id          TEXT REFERENCES check_jobs(job_id),
    export_format   TEXT NOT NULL
        CHECK (export_format IN ('csv','iif','xero','zoho','excel','qbo_api')),
    check_count     INTEGER DEFAULT 0,
    check_ids       UUID[],
    file_url        TEXT,
    file_name       TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','complete','error')),
    error_message   TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- ── Audit Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id),
    check_id    UUID REFERENCES checks(id),
    job_id      TEXT,
    action      TEXT NOT NULL,
    field       TEXT,
    old_value   TEXT,
    new_value   TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Accounting Connections ─────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL
        CHECK (provider IN ('quickbooks','zoho','xero','sage','freshbooks')),
    realm_id        TEXT,
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes          TEXT[],
    status          TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','expired','revoked','error')),
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Team Invitations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin','member','viewer')),
    invited_by  UUID REFERENCES auth.users(id),
    status      TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','expired')),
    token       TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Functions (all use CREATE OR REPLACE for safe re-runs)
-- ══════════════════════════════════════════════════════════════════════════════

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_jobs_updated ON check_jobs;
CREATE TRIGGER trg_check_jobs_updated
    BEFORE UPDATE ON check_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_checks_updated ON checks;
CREATE TRIGGER trg_checks_updated
    BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── flatten_checks_from_job: upsert checks_data JSONB → checks table ──
CREATE OR REPLACE FUNCTION flatten_checks_from_job(p_job_id TEXT)
RETURNS void AS $$
DECLARE
    _job RECORD;
    _check JSONB;
    _ext JSONB;
    _micr JSONB;
    _amount_text TEXT;
    _amount_num NUMERIC;
    _date_text TEXT;
    _date_val DATE;
BEGIN
    SELECT * INTO _job FROM check_jobs WHERE job_id = p_job_id;
    IF NOT FOUND THEN RETURN; END IF;

    FOR _check IN SELECT jsonb_array_elements(_job.checks_data)
    LOOP
        _ext := _check->'extraction';
        _micr := _ext->'micr';

        -- Parse amount: handle {value, confidence} or plain string
        _amount_text := COALESCE(
            _ext->'amount'->>'value',
            _ext->>'amount'
        );
        BEGIN
            _amount_num := regexp_replace(COALESCE(_amount_text,''), '[^0-9.]', '', 'g')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            _amount_num := NULL;
        END;

        -- Parse date
        _date_text := COALESCE(
            _ext->'checkDate'->>'value',
            _ext->>'checkDate'
        );
        BEGIN
            _date_val := _date_text::DATE;
        EXCEPTION WHEN OTHERS THEN
            _date_val := NULL;
        END;

        INSERT INTO checks (
            tenant_id, job_id, check_id, source_file,
            page_number, image_width, image_height, file_url,
            payee, payee_confidence, payee_source,
            amount, amount_raw, amount_confidence, amount_source,
            amount_written, amount_written_confidence,
            check_date, check_date_raw, check_date_confidence, check_date_source,
            check_number, check_number_confidence, check_number_source,
            bank_name, bank_name_confidence, bank_name_source,
            memo, memo_confidence,
            micr_routing, micr_routing_confidence,
            micr_account, micr_account_confidence,
            micr_serial, micr_raw,
            hybrid_results, ocr_results,
            status
        ) VALUES (
            COALESCE(_job.tenant_id, '00000000-0000-0000-0000-000000000000'::UUID),
            p_job_id,
            _check->>'check_id',
            _job.pdf_name,
            COALESCE((_check->>'page')::INT, 1),
            (_check->>'width')::INT,
            (_check->>'height')::INT,
            _check->>'image_url',
            -- payee
            COALESCE(_ext->'payee'->>'value', _ext->>'payee'),
            (_ext->'payee'->>'confidence')::NUMERIC,
            _ext->'payee'->>'source',
            -- amount
            _amount_num,
            _amount_text,
            (_ext->'amount'->>'confidence')::NUMERIC,
            _ext->'amount'->>'source',
            -- amount_written
            COALESCE(_ext->'amountWritten'->>'value', _ext->>'amountWritten'),
            (_ext->'amountWritten'->>'confidence')::NUMERIC,
            -- date
            _date_val,
            _date_text,
            (_ext->'checkDate'->>'confidence')::NUMERIC,
            _ext->'checkDate'->>'source',
            -- check_number
            COALESCE(_ext->'checkNumber'->>'value', _ext->>'checkNumber'),
            (_ext->'checkNumber'->>'confidence')::NUMERIC,
            _ext->'checkNumber'->>'source',
            -- bank
            COALESCE(_ext->'bankName'->>'value', _ext->>'bankName'),
            (_ext->'bankName'->>'confidence')::NUMERIC,
            _ext->'bankName'->>'source',
            -- memo
            COALESCE(_ext->'memo'->>'value', _ext->>'memo'),
            (_ext->'memo'->>'confidence')::NUMERIC,
            -- micr
            COALESCE(_micr->'routing'->>'value', _micr->>'routing'),
            (_micr->'routing'->>'confidence')::NUMERIC,
            COALESCE(_micr->'account'->>'value', _micr->>'account'),
            (_micr->'account'->>'confidence')::NUMERIC,
            COALESCE(_micr->'serial'->>'value', _micr->>'serial'),
            _micr->>'raw',
            -- raw results
            _ext,
            _check->'engine_results',
            'pending_review'
        )
        ON CONFLICT (job_id, check_id)
        DO UPDATE SET
            page_number     = EXCLUDED.page_number,
            image_width     = EXCLUDED.image_width,
            image_height    = EXCLUDED.image_height,
            file_url        = EXCLUDED.file_url,
            payee           = EXCLUDED.payee,
            payee_confidence = EXCLUDED.payee_confidence,
            amount          = EXCLUDED.amount,
            amount_raw      = EXCLUDED.amount_raw,
            amount_confidence = EXCLUDED.amount_confidence,
            check_date      = EXCLUDED.check_date,
            check_date_raw  = EXCLUDED.check_date_raw,
            check_date_confidence = EXCLUDED.check_date_confidence,
            check_number    = EXCLUDED.check_number,
            check_number_confidence = EXCLUDED.check_number_confidence,
            bank_name       = EXCLUDED.bank_name,
            bank_name_confidence = EXCLUDED.bank_name_confidence,
            memo            = EXCLUDED.memo,
            memo_confidence = EXCLUDED.memo_confidence,
            micr_routing    = EXCLUDED.micr_routing,
            micr_account    = EXCLUDED.micr_account,
            hybrid_results  = EXCLUDED.hybrid_results,
            updated_at      = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS Policies (service role bypass for backend)
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all" ON tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tenant_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON check_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON checks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON export_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON accounting_connections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON team_invitations FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- Storage Bucket (uses ON CONFLICT for safe re-runs)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('checks', 'checks', true, 52428800, ARRAY['image/jpeg','image/png','image/jpg','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop and recreate to ensure correct configuration)
DROP POLICY IF EXISTS "public_read_checks" ON storage.objects;
DROP POLICY IF EXISTS "public_write_checks" ON storage.objects;
DROP POLICY IF EXISTS "public_update_checks" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_checks" ON storage.objects;

CREATE POLICY "public_read_checks" ON storage.objects FOR SELECT USING (bucket_id = 'checks');
CREATE POLICY "public_write_checks" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'checks');
CREATE POLICY "public_update_checks" ON storage.objects FOR UPDATE USING (bucket_id = 'checks');
CREATE POLICY "public_delete_checks" ON storage.objects FOR DELETE USING (bucket_id = 'checks');
