-- ============================================================================
-- CHECK EXTRACTOR - COMPLETE SUPABASE SCHEMA
-- Master migration file: creates all tables, views, indexes, functions,
-- triggers, storage buckets, and RLS policies.
--
-- Run this against a fresh Supabase project:
--   psql $DATABASE_URL -f 00000000000000_master_schema.sql
--
-- Or paste into Supabase SQL Editor.
-- ============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. EXTENSIONS                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. CORE TABLES                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── 2a. Tenants (multi-tenant isolation) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2b. User Profiles (extends auth.users) ───────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2c. Tenant Settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    gemini_api_key_encrypted    TEXT,
    default_export_format       TEXT DEFAULT 'csv' CHECK (default_export_format IN ('csv','iif','xero','zoho','excel')),
    auto_export_enabled         BOOLEAN DEFAULT FALSE,
    auto_export_threshold       NUMERIC(3,2) DEFAULT 0.95,
    default_expense_account     TEXT DEFAULT 'Uncategorized Expense',
    default_bank_account        TEXT DEFAULT 'Checking',
    currency                    TEXT DEFAULT 'USD',
    webhook_url                 TEXT,
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

-- ── 2d. Check Jobs (one row per uploaded PDF) ────────────────────────────
-- This is the PRIMARY table for the Python backend.
-- Each PDF upload creates one row. All extracted checks are stored as JSONB.
CREATE TABLE IF NOT EXISTS check_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    job_id          TEXT UNIQUE NOT NULL,

    -- PDF info
    pdf_name        TEXT NOT NULL,
    pdf_url         TEXT,                    -- Supabase Storage URL
    pdf_size        INTEGER,                 -- bytes

    -- Processing status
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','detecting','extracting','ocr','complete','error')),
    doc_format      TEXT,                    -- 'Contour/Bordered', 'Line-Grid', 'Auto'
    total_pages     INTEGER DEFAULT 0,
    total_checks    INTEGER DEFAULT 0,

    -- All extracted checks as JSON array
    -- Each element: {
    --   "check_id": "check_0001",
    --   "page": 1,
    --   "width": 800, "height": 300,
    --   "image_url": "https://...supabase.co/storage/v1/object/public/checks/jobs/abc/images/check_0001.png",
    --   "extraction": {
    --     "payee":       {"value": "John Doe",   "confidence": 0.95, "source": "gemini"},
    --     "amount":      {"value": "1,250.00",   "confidence": 0.98, "source": "hybrid"},
    --     "checkDate":   {"value": "01/15/2026", "confidence": 0.90, "source": "tesseract"},
    --     "checkNumber": {"value": "1234",       "confidence": 0.92, "source": "gemini"},
    --     "bankName":    {"value": "Chase",      "confidence": 0.88, "source": "gemini"},
    --     "memo":        {"value": "Rent",       "confidence": 0.70, "source": "gemini"},
    --     "micr":        {"routing": {"value":"021000021"}, "account": {"value":"123456789"}},
    --     "confidence_summary": 0.91
    --   }
    -- }
    checks_data     JSONB DEFAULT '[]'::jsonb,

    -- Error tracking
    error_message   TEXT,

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE check_jobs IS 'One row per PDF upload. checks_data JSONB holds all extracted checks with images and OCR results.';
COMMENT ON COLUMN check_jobs.checks_data IS 'JSON array of check objects. Each has check_id, page, image_url, and extraction fields.';

-- ── 2e. Individual Checks (flattened from check_jobs for querying) ───────
-- Populated by a trigger or the backend after OCR completes.
-- Useful for searching, filtering, and exporting individual checks.
CREATE TABLE IF NOT EXISTS checks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id                  TEXT REFERENCES check_jobs(job_id) ON DELETE CASCADE,
    user_id                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Identity
    check_id                TEXT NOT NULL,           -- e.g. "check_0001"
    page_number             INTEGER DEFAULT 1,
    check_index             INTEGER DEFAULT 1,

    -- File references
    source_file             TEXT NOT NULL,            -- original PDF name
    file_url                TEXT,                     -- check image URL (Storage)
    image_width             INTEGER,
    image_height            INTEGER,

    -- Status
    status                  TEXT NOT NULL DEFAULT 'pending_review'
                            CHECK (status IN (
                                'pending_review','approved','rejected',
                                'exported','duplicate','error'
                            )),

    -- ── Extracted fields with per-field confidence ──
    payee                   TEXT,
    payee_confidence        NUMERIC(5,4),
    payee_source            TEXT,

    amount                  NUMERIC(12,2),
    amount_raw              TEXT,                     -- original string e.g. "$1,250.00"
    amount_confidence       NUMERIC(5,4),
    amount_source           TEXT,

    amount_written          TEXT,
    amount_written_confidence NUMERIC(5,4),

    check_date              DATE,
    check_date_raw          TEXT,                     -- original string e.g. "01/15/2026"
    check_date_confidence   NUMERIC(5,4),
    check_date_source       TEXT,

    check_number            TEXT,
    check_number_confidence NUMERIC(5,4),
    check_number_source     TEXT,

    bank_name               TEXT,
    bank_name_confidence    NUMERIC(5,4),
    bank_name_source        TEXT,

    memo                    TEXT,
    memo_confidence         NUMERIC(5,4),

    -- MICR data
    micr_routing            TEXT,
    micr_routing_confidence NUMERIC(5,4),
    micr_account            TEXT,
    micr_account_confidence NUMERIC(5,4),
    micr_serial             TEXT,
    micr_raw                TEXT,

    -- Overall confidence
    confidence_summary      NUMERIC(5,4),

    -- Raw OCR engine results (for debugging/comparison)
    ocr_results             JSONB,                   -- full tesseract output
    ai_results              JSONB,                    -- full gemini output
    hybrid_results          JSONB,                    -- merged hybrid output

    -- Validation
    validation_errors       JSONB DEFAULT '[]'::jsonb,
    validation_warnings     JSONB DEFAULT '[]'::jsonb,

    -- Review
    reviewed_by             UUID REFERENCES auth.users(id),
    reviewed_at             TIMESTAMPTZ,
    review_notes            TEXT,

    -- Export tracking
    exported                BOOLEAN DEFAULT FALSE,
    exported_at             TIMESTAMPTZ,
    export_format           TEXT,                     -- 'csv','iif','xero','zoho'
    export_batch_id         UUID,

    -- QuickBooks sync
    qbo_synced              BOOLEAN DEFAULT FALSE,
    qbo_transaction_id      TEXT,
    qbo_sync_error          TEXT,
    qbo_synced_at           TIMESTAMPTZ,

    -- Currency
    currency                TEXT DEFAULT 'USD',

    -- Custom/extensible
    custom_fields           JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    deleted_at              TIMESTAMPTZ              -- soft delete
);

-- ── 2f. Export History ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    job_id          TEXT REFERENCES check_jobs(job_id) ON DELETE SET NULL,

    export_format   TEXT NOT NULL CHECK (export_format IN ('csv','iif','xero','zoho','excel','qbo_api')),
    check_count     INTEGER DEFAULT 0,
    check_ids       UUID[],                  -- which checks were exported
    file_url        TEXT,                    -- download URL if stored
    file_name       TEXT,

    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','complete','error')),
    error_message   TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,

    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- ── 2g. Audit Logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    check_id    UUID REFERENCES checks(id) ON DELETE CASCADE,
    job_id      TEXT,

    action      TEXT NOT NULL,               -- 'upload','process','review','approve','export','edit','delete'
    field       TEXT,                        -- which field was changed
    old_value   TEXT,
    new_value   TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,

    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2h. Accounting Integrations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL CHECK (provider IN ('quickbooks','zoho','xero','sage','freshbooks')),
    realm_id        TEXT,                    -- QBO realm / Zoho org / Xero tenant
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes          TEXT[],
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked','error')),
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(tenant_id, provider)
);

-- ── 2i. Team Invitations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
    invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
    token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at  TIMESTAMPTZ DEFAULT now()
);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. INDEXES                                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- check_jobs
CREATE INDEX IF NOT EXISTS idx_check_jobs_job_id      ON check_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_check_jobs_tenant       ON check_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_check_jobs_status       ON check_jobs(status);
CREATE INDEX IF NOT EXISTS idx_check_jobs_created      ON check_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_jobs_data         ON check_jobs USING GIN(checks_data);

-- checks
CREATE INDEX IF NOT EXISTS idx_checks_tenant           ON checks(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_job              ON checks(job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_status           ON checks(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_payee            ON checks(tenant_id, payee) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_amount           ON checks(amount) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_date             ON checks(check_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_number           ON checks(tenant_id, check_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_confidence       ON checks(confidence_summary) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_exported         ON checks(exported) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_created          ON checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_tenant_status    ON checks(tenant_id, status, check_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checks_ocr_results      ON checks USING GIN(ocr_results);
CREATE INDEX IF NOT EXISTS idx_checks_ai_results       ON checks USING GIN(ai_results);

-- Duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_checks_dedup
    ON checks(tenant_id, check_number, amount, check_date)
    WHERE deleted_at IS NULL AND status NOT IN ('rejected','duplicate');

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_tenant         ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email          ON profiles(email);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_check             ON audit_logs(check_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant            ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created           ON audit_logs(created_at DESC);

-- export_history
CREATE INDEX IF NOT EXISTS idx_export_tenant           ON export_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_job              ON export_history(job_id);

-- accounting_connections
CREATE INDEX IF NOT EXISTS idx_acct_conn_tenant        ON accounting_connections(tenant_id);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. VIEWS                                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Dashboard summary per tenant
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
    tenant_id,
    COUNT(*)                                                    AS total_checks,
    COUNT(*) FILTER (WHERE status = 'pending_review')           AS pending_review,
    COUNT(*) FILTER (WHERE status = 'approved')                 AS approved,
    COUNT(*) FILTER (WHERE status = 'exported')                 AS exported,
    COUNT(*) FILTER (WHERE status = 'rejected')                 AS rejected,
    COUNT(*) FILTER (WHERE status = 'error')                    AS errors,
    ROUND(AVG(confidence_summary)::numeric, 4)                  AS avg_confidence,
    COALESCE(SUM(amount), 0)                                    AS total_amount,
    COUNT(*) FILTER (WHERE confidence_summary >= 0.90)          AS high_confidence,
    COUNT(*) FILTER (WHERE confidence_summary < 0.70)           AS low_confidence,
    MAX(created_at)                                             AS last_upload
FROM checks
WHERE deleted_at IS NULL
GROUP BY tenant_id;

-- Job summary view
CREATE OR REPLACE VIEW v_job_summary AS
SELECT
    cj.id,
    cj.job_id,
    cj.tenant_id,
    cj.pdf_name,
    cj.status,
    cj.doc_format,
    cj.total_pages,
    cj.total_checks,
    cj.created_at,
    cj.completed_at,
    EXTRACT(EPOCH FROM (cj.completed_at - cj.created_at))      AS duration_seconds,
    jsonb_array_length(cj.checks_data)                          AS checks_extracted,
    cj.pdf_url
FROM check_jobs cj
ORDER BY cj.created_at DESC;

-- Checks needing review (low confidence)
CREATE OR REPLACE VIEW v_checks_needing_review AS
SELECT
    c.*,
    cj.pdf_name,
    cj.job_id AS source_job_id
FROM checks c
LEFT JOIN check_jobs cj ON cj.job_id = c.job_id
WHERE c.deleted_at IS NULL
  AND c.status = 'pending_review'
  AND (c.confidence_summary IS NULL OR c.confidence_summary < 0.85)
ORDER BY c.confidence_summary ASC NULLS FIRST;

-- Export-ready checks
CREATE OR REPLACE VIEW v_export_ready AS
SELECT
    c.id,
    c.tenant_id,
    c.check_id,
    c.payee,
    c.amount,
    c.check_date,
    c.check_number,
    c.bank_name,
    c.memo,
    c.micr_routing,
    c.micr_account,
    c.confidence_summary,
    c.source_file,
    c.file_url,
    c.job_id
FROM checks c
WHERE c.deleted_at IS NULL
  AND c.status = 'approved'
  AND c.exported = FALSE;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5. FUNCTIONS                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create profile + tenant on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    _tenant_id UUID;
    _name TEXT;
BEGIN
    _name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

    -- Create a personal tenant
    INSERT INTO tenants (name, slug)
    VALUES (_name || '''s Workspace', lower(replace(_name, ' ', '-')) || '-' || substr(NEW.id::text, 1, 8))
    RETURNING id INTO _tenant_id;

    -- Create profile
    INSERT INTO profiles (id, tenant_id, email, full_name, role)
    VALUES (NEW.id, _tenant_id, NEW.email, _name, 'admin');

    -- Create default settings
    INSERT INTO tenant_settings (tenant_id) VALUES (_tenant_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Flatten check_jobs.checks_data into individual checks rows
CREATE OR REPLACE FUNCTION flatten_checks_from_job(p_job_id TEXT, p_tenant_id UUID DEFAULT NULL, p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    _job       check_jobs%ROWTYPE;
    _check     JSONB;
    _ext       JSONB;
    _count     INTEGER := 0;
    _amt_text  TEXT;
    _amt       NUMERIC;
    _date_text TEXT;
    _date      DATE;
BEGIN
    SELECT * INTO _job FROM check_jobs WHERE job_id = p_job_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    FOR _check IN SELECT jsonb_array_elements(_job.checks_data)
    LOOP
        _ext := _check->'extraction';

        -- Parse amount
        _amt_text := _ext->'amount'->>'value';
        BEGIN
            _amt := regexp_replace(COALESCE(_amt_text,''), '[^0-9.]', '', 'g')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            _amt := NULL;
        END;

        -- Parse date
        _date_text := _ext->'checkDate'->>'value';
        BEGIN
            _date := _date_text::DATE;
        EXCEPTION WHEN OTHERS THEN
            _date := NULL;
        END;

        INSERT INTO checks (
            tenant_id, job_id, user_id, check_id, page_number,
            source_file, file_url, image_width, image_height,
            payee, payee_confidence, payee_source,
            amount, amount_raw, amount_confidence, amount_source,
            check_date, check_date_raw, check_date_confidence, check_date_source,
            check_number, check_number_confidence, check_number_source,
            bank_name, bank_name_confidence, bank_name_source,
            memo, memo_confidence,
            micr_routing, micr_account, micr_serial,
            confidence_summary, hybrid_results
        ) VALUES (
            COALESCE(p_tenant_id, _job.tenant_id),
            p_job_id,
            COALESCE(p_user_id, _job.user_id),
            _check->>'check_id',
            (_check->>'page')::INTEGER,
            _job.pdf_name,
            _check->>'image_url',
            (_check->>'width')::INTEGER,
            (_check->>'height')::INTEGER,
            _ext->'payee'->>'value',
            (_ext->'payee'->>'confidence')::NUMERIC,
            _ext->'payee'->>'source',
            _amt,
            _amt_text,
            (_ext->'amount'->>'confidence')::NUMERIC,
            _ext->'amount'->>'source',
            _date,
            _date_text,
            (_ext->'checkDate'->>'confidence')::NUMERIC,
            _ext->'checkDate'->>'source',
            _ext->'checkNumber'->>'value',
            (_ext->'checkNumber'->>'confidence')::NUMERIC,
            _ext->'checkNumber'->>'source',
            _ext->'bankName'->>'value',
            (_ext->'bankName'->>'confidence')::NUMERIC,
            _ext->'bankName'->>'source',
            _ext->'memo'->>'value',
            (_ext->'memo'->>'confidence')::NUMERIC,
            _ext->'micr'->'routing'->>'value',
            _ext->'micr'->'account'->>'value',
            _ext->'micr'->'serial'->>'value',
            (_ext->>'confidence_summary')::NUMERIC,
            _ext
        )
        ON CONFLICT DO NOTHING;

        _count := _count + 1;
    END LOOP;

    RETURN _count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION flatten_checks_from_job IS 'Expands check_jobs.checks_data JSON into individual rows in the checks table for querying/export.';

-- Generate QuickBooks IIF export content
-- Returns TEXT in IIF format for a set of check IDs
CREATE OR REPLACE FUNCTION generate_iif_export(p_check_ids UUID[], p_bank_account TEXT DEFAULT 'Checking', p_expense_account TEXT DEFAULT 'Uncategorized Expense')
RETURNS TEXT AS $$
DECLARE
    _iif TEXT := '';
    _c   checks%ROWTYPE;
BEGIN
    -- IIF Header
    _iif := '!TRNS' || E'\t' || 'TRNSTYPE' || E'\t' || 'DATE' || E'\t' || 'ACCNT' || E'\t' || 'NAME' || E'\t' || 'AMOUNT' || E'\t' || 'DOCNUM' || E'\t' || 'MEMO' || E'\n';
    _iif := _iif || '!SPL' || E'\t' || 'TRNSTYPE' || E'\t' || 'DATE' || E'\t' || 'ACCNT' || E'\t' || 'NAME' || E'\t' || 'AMOUNT' || E'\t' || 'DOCNUM' || E'\t' || 'MEMO' || E'\n';
    _iif := _iif || '!ENDTRNS' || E'\n';

    FOR _c IN SELECT * FROM checks WHERE id = ANY(p_check_ids) AND deleted_at IS NULL ORDER BY check_date, check_number
    LOOP
        -- TRNS line (the check itself - negative amount from bank)
        _iif := _iif || 'TRNS' || E'\t'
            || 'CHECK' || E'\t'
            || COALESCE(to_char(_c.check_date, 'MM/DD/YYYY'), '') || E'\t'
            || p_bank_account || E'\t'
            || COALESCE(_c.payee, '') || E'\t'
            || COALESCE((-1 * _c.amount)::TEXT, '0') || E'\t'
            || COALESCE(_c.check_number, '') || E'\t'
            || COALESCE(_c.memo, '') || E'\n';

        -- SPL line (the expense split - positive amount)
        _iif := _iif || 'SPL' || E'\t'
            || 'CHECK' || E'\t'
            || COALESCE(to_char(_c.check_date, 'MM/DD/YYYY'), '') || E'\t'
            || p_expense_account || E'\t'
            || COALESCE(_c.payee, '') || E'\t'
            || COALESCE(_c.amount::TEXT, '0') || E'\t'
            || COALESCE(_c.check_number, '') || E'\t'
            || COALESCE(_c.memo, '') || E'\n';

        _iif := _iif || 'ENDTRNS' || E'\n';
    END LOOP;

    RETURN _iif;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_iif_export IS 'Generates QuickBooks Desktop IIF file content for importing checks as CHECK transactions.';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6. TRIGGERS                                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- updated_at triggers
CREATE OR REPLACE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_checks_updated BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_check_jobs_updated BEFORE UPDATE ON check_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_settings_updated BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_acct_conn_updated BEFORE UPDATE ON accounting_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7. STORAGE BUCKETS                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Main bucket for check images and PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'checks', 'checks', true,
    52428800,  -- 50MB
    ARRAY['image/jpeg','image/png','image/jpg','image/webp','application/pdf']
) ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800;

-- Exports bucket (for generated CSV/IIF files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exports', 'exports', false,
    10485760,  -- 10MB
    ARRAY['text/csv','text/plain','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  8. ROW LEVEL SECURITY                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Enable RLS on all tables
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations     ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's tenant_id
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Tenants ──
CREATE POLICY "tenant_select" ON tenants FOR SELECT
    USING (id = auth_tenant_id());

-- ── Profiles ──
CREATE POLICY "profile_select" ON profiles FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "profile_update_own" ON profiles FOR UPDATE
    USING (id = auth.uid());

-- ── Tenant Settings ──
CREATE POLICY "settings_select" ON tenant_settings FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "settings_update" ON tenant_settings FOR UPDATE
    USING (tenant_id = auth_tenant_id());

-- ── Check Jobs ──
CREATE POLICY "jobs_select" ON check_jobs FOR SELECT
    USING (tenant_id = auth_tenant_id() OR tenant_id IS NULL);
CREATE POLICY "jobs_insert" ON check_jobs FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id() OR tenant_id IS NULL);
CREATE POLICY "jobs_update" ON check_jobs FOR UPDATE
    USING (tenant_id = auth_tenant_id() OR tenant_id IS NULL);

-- Service role bypass (for Python backend)
CREATE POLICY "jobs_service_all" ON check_jobs FOR ALL
    USING (true) WITH CHECK (true);

-- ── Checks ──
CREATE POLICY "checks_select" ON checks FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "checks_insert" ON checks FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id());
CREATE POLICY "checks_update" ON checks FOR UPDATE
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "checks_delete" ON checks FOR DELETE
    USING (tenant_id = auth_tenant_id());

-- Service role bypass
CREATE POLICY "checks_service_all" ON checks FOR ALL
    USING (true) WITH CHECK (true);

-- ── Export History ──
CREATE POLICY "export_select" ON export_history FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "export_insert" ON export_history FOR INSERT
    WITH CHECK (tenant_id = auth_tenant_id());

-- ── Audit Logs ──
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
    WITH CHECK (true);  -- service role inserts

-- ── Accounting Connections ──
CREATE POLICY "acct_select" ON accounting_connections FOR SELECT
    USING (tenant_id = auth_tenant_id());
CREATE POLICY "acct_manage" ON accounting_connections FOR ALL
    USING (tenant_id = auth_tenant_id());

-- ── Team Invitations ──
CREATE POLICY "invite_manage" ON team_invitations FOR ALL
    USING (tenant_id = auth_tenant_id());

-- ── Storage Policies ──
CREATE POLICY "storage_checks_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'checks');
CREATE POLICY "storage_checks_write" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'checks');
CREATE POLICY "storage_checks_update" ON storage.objects FOR UPDATE
    USING (bucket_id = 'checks');
CREATE POLICY "storage_checks_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'checks');

CREATE POLICY "storage_exports_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'exports' AND auth.uid() IS NOT NULL);
CREATE POLICY "storage_exports_write" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'exports' AND auth.uid() IS NOT NULL);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  9. SEED DATA (optional - for testing)                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Uncomment to create a test tenant:
-- INSERT INTO tenants (name, slug) VALUES ('Test Company', 'test-company');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  EXPORT FORMAT REFERENCE                                                ║
-- ║  (not SQL - just documentation for the backend export endpoints)        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

/*
EXPORT FORMATS SUPPORTED:
=========================

1. GENERIC CSV
   Columns: Check Number, Date, Payee, Amount, Bank, Memo, Routing, Account, Confidence
   Works with: Excel, Google Sheets, any spreadsheet tool

2. QUICKBOOKS DESKTOP (IIF)
   Tab-delimited file with !TRNS/!SPL/!ENDTRNS structure
   Transaction type: CHECK
   - TRNS line: bank account (negative amount)
   - SPL line: expense account (positive amount)
   - DOCNUM = check number, NAME = payee, MEMO = memo
   Date format: MM/DD/YYYY
   Generated by: generate_iif_export() SQL function or Python endpoint

3. QUICKBOOKS ONLINE (CSV)
   Columns: Date, Transaction Type, Num, Name, Memo/Description, Account, Amount
   Transaction Type = "Check"
   Import via: Banking > Upload transactions

4. XERO (CSV Bank Statement)
   Columns: Date, Amount, Payee, Description, Reference, Check Number
   Date format: DD/MM/YYYY (configurable per Xero org)
   Amount: negative for payments (checks)
   Import via: Bank Accounts > Import a Statement

5. ZOHO BOOKS (CSV)
   Columns: Date, Reference Number, Payee Name, Amount, Account, Description
   Date format: YYYY-MM-DD or DD/MM/YYYY
   Import via: Banking > Import Statement

6. EXCEL (XLSX)
   Same columns as Generic CSV but in .xlsx format
   Uses openpyxl or xlsxwriter in Python

7. SAGE (CSV)
   Columns: Date, Reference, Description, Amount, Bank Account
   Date format: DD/MM/YYYY
*/
