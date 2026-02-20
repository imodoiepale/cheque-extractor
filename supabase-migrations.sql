-- ══════════════════════════════════════════════════════════════════════════════
-- Supabase Database Schema for Cheque Extractor
-- ══════════════════════════════════════════════════════════════════════════════

-- Table: app_settings
-- Stores application-wide settings and API keys securely
CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    gemini_api_key TEXT,
    qbo_connected BOOLEAN DEFAULT FALSE,
    qbo_company_id TEXT,
    qbo_access_token TEXT,
    qbo_refresh_token TEXT,
    qbo_token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Table: quickbooks_entries
-- Stores QuickBooks data for comparison with extractions
CREATE TABLE IF NOT EXISTS quickbooks_entries (
    id SERIAL PRIMARY KEY,
    check_number TEXT NOT NULL,
    date TEXT NOT NULL,
    amount TEXT NOT NULL,
    payee TEXT NOT NULL,
    account TEXT DEFAULT 'Checking',
    memo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for quickbooks_entries
CREATE INDEX IF NOT EXISTS idx_qb_check_number ON quickbooks_entries(check_number);
CREATE INDEX IF NOT EXISTS idx_qb_date ON quickbooks_entries(date);
CREATE INDEX IF NOT EXISTS idx_qb_payee ON quickbooks_entries(payee);

-- Table: check_jobs (should already exist, but adding for completeness)
CREATE TABLE IF NOT EXISTS check_jobs (
    id SERIAL PRIMARY KEY,
    job_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    pdf_name TEXT NOT NULL,
    pdf_url TEXT,
    file_size INTEGER,
    doc_format TEXT,
    total_pages INTEGER DEFAULT 0,
    total_checks INTEGER DEFAULT 0,
    checks_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for check_jobs
CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON check_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON check_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON check_jobs(created_at DESC);

-- Enable Row Level Security (RLS) for security
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quickbooks_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth setup)
-- For now, allow all authenticated users to read/write
-- In production, you should restrict this based on user roles

-- app_settings policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to read settings"
    ON app_settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update settings"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to insert settings"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- quickbooks_entries policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to read QB entries"
    ON quickbooks_entries FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to insert QB entries"
    ON quickbooks_entries FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete QB entries"
    ON quickbooks_entries FOR DELETE
    TO authenticated
    USING (true);

-- check_jobs policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to read jobs"
    ON check_jobs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to insert jobs"
    ON check_jobs FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update jobs"
    ON check_jobs FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete jobs"
    ON check_jobs FOR DELETE
    TO authenticated
    USING (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quickbooks_entries_updated_at ON quickbooks_entries;
CREATE TRIGGER update_quickbooks_entries_updated_at
    BEFORE UPDATE ON quickbooks_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_check_jobs_updated_at ON check_jobs;
CREATE TRIGGER update_check_jobs_updated_at
    BEFORE UPDATE ON check_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings row
INSERT INTO app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE app_settings IS 'Application-wide settings including API keys and OAuth tokens';
COMMENT ON TABLE quickbooks_entries IS 'QuickBooks data imported for comparison with check extractions';
COMMENT ON TABLE check_jobs IS 'Check extraction jobs and their results';

COMMENT ON COLUMN app_settings.gemini_api_key IS 'Google Gemini API key for AI extraction (encrypted at rest)';
COMMENT ON COLUMN app_settings.qbo_access_token IS 'QuickBooks OAuth access token (encrypted at rest)';
COMMENT ON COLUMN app_settings.qbo_refresh_token IS 'QuickBooks OAuth refresh token (encrypted at rest)';
