-- Create check_jobs table: one row per PDF processing job
-- checks_data is a JSON array of all extracted checks with their image URLs and OCR results
CREATE TABLE IF NOT EXISTS check_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id TEXT UNIQUE NOT NULL,
    pdf_name TEXT NOT NULL,
    pdf_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    doc_format TEXT,
    total_pages INTEGER DEFAULT 0,
    total_checks INTEGER DEFAULT 0,
    checks_data JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_check_jobs_job_id ON check_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_check_jobs_status ON check_jobs(status);

-- RLS: allow service role full access
ALTER TABLE check_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON check_jobs
    FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for check images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('checks', 'checks', true)
ON CONFLICT (id) DO NOTHING;
