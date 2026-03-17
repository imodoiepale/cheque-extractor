-- ============================================================================
-- Add API Usage Tracking for Accurate Billing
-- Tracks actual Google Cloud API usage (Gemini, Vision) and costs
-- ============================================================================

-- ── API Usage Logs (tracks every API call with exact costs from GCC) ──
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_id              TEXT REFERENCES check_jobs(job_id) ON DELETE CASCADE,
    check_id            TEXT,
    
    -- API Details
    api_provider        TEXT NOT NULL CHECK (api_provider IN ('gemini', 'openai', 'vision', 'numarkdown')),
    api_model           TEXT,
    api_endpoint        TEXT,
    
    -- Usage Metadata (from API response)
    prompt_tokens       INTEGER DEFAULT 0,
    completion_tokens   INTEGER DEFAULT 0,
    total_tokens        INTEGER DEFAULT 0,
    
    -- Cost (calculated from actual API pricing)
    cost_usd            NUMERIC(10, 6) DEFAULT 0,
    cost_input_usd      NUMERIC(10, 6) DEFAULT 0,
    cost_output_usd     NUMERIC(10, 6) DEFAULT 0,
    
    -- Timing
    processing_time_ms  INTEGER,
    
    -- Metadata
    request_metadata    JSONB DEFAULT '{}'::jsonb,
    response_metadata   JSONB DEFAULT '{}'::jsonb,
    
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_id ON api_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_job_id ON api_usage_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage_logs(api_provider);

-- ── Add usage tracking fields to check_jobs ──
ALTER TABLE check_jobs ADD COLUMN IF NOT EXISTS total_api_cost_usd NUMERIC(10, 6) DEFAULT 0;
ALTER TABLE check_jobs ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;
ALTER TABLE check_jobs ADD COLUMN IF NOT EXISTS api_usage_summary JSONB DEFAULT '{}'::jsonb;

-- ── Function to aggregate API usage for a job ──
CREATE OR REPLACE FUNCTION update_job_api_usage(p_job_id TEXT)
RETURNS void AS $$
DECLARE
    _total_cost NUMERIC;
    _total_tokens INTEGER;
    _usage_summary JSONB;
BEGIN
    -- Calculate totals
    SELECT 
        COALESCE(SUM(cost_usd), 0),
        COALESCE(SUM(total_tokens), 0),
        jsonb_build_object(
            'gemini', jsonb_build_object(
                'calls', COUNT(*) FILTER (WHERE api_provider = 'gemini'),
                'tokens', COALESCE(SUM(total_tokens) FILTER (WHERE api_provider = 'gemini'), 0),
                'cost_usd', COALESCE(SUM(cost_usd) FILTER (WHERE api_provider = 'gemini'), 0)
            ),
            'openai', jsonb_build_object(
                'calls', COUNT(*) FILTER (WHERE api_provider = 'openai'),
                'tokens', COALESCE(SUM(total_tokens) FILTER (WHERE api_provider = 'openai'), 0),
                'cost_usd', COALESCE(SUM(cost_usd) FILTER (WHERE api_provider = 'openai'), 0)
            ),
            'total_calls', COUNT(*),
            'total_tokens', COALESCE(SUM(total_tokens), 0),
            'total_cost_usd', COALESCE(SUM(cost_usd), 0)
        )
    INTO _total_cost, _total_tokens, _usage_summary
    FROM api_usage_logs
    WHERE job_id = p_job_id;
    
    -- Update job record
    UPDATE check_jobs
    SET 
        total_api_cost_usd = _total_cost,
        total_tokens = _total_tokens,
        api_usage_summary = _usage_summary,
        updated_at = now()
    WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS Policies ──
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON api_usage_logs FOR ALL USING (true) WITH CHECK (true);

-- ── Comments ──
COMMENT ON TABLE api_usage_logs IS 'Tracks actual API usage and costs from Google Cloud and OpenAI for accurate billing';
COMMENT ON COLUMN api_usage_logs.cost_usd IS 'Actual cost from API provider pricing, matches Google Cloud Console billing';
COMMENT ON FUNCTION update_job_api_usage IS 'Aggregates API usage costs for a job from individual API calls';
