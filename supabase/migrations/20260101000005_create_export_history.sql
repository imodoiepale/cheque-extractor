-- Export history tracking
CREATE TABLE export_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Export batch information
  batch_id UUID DEFAULT uuid_generate_v4(),
  export_type TEXT NOT NULL, -- 'qbo_api', 'qbo_csv', 'generic_csv', 'manual'
  
  -- Check references (can be multiple checks in one export)
  check_ids UUID[] NOT NULL,
  total_checks INTEGER NOT NULL,
  
  -- QuickBooks specific
  qbo_company_id TEXT,
  qbo_transaction_ids TEXT[], -- Array of QBO transaction IDs
  
  -- Export file (for CSV exports)
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'processing', 'success', 'partial_success', 'failed'
  
  -- Results
  successful_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  error_message TEXT,
  error_details JSONB,
  
  -- Individual check results
  check_results JSONB,
  -- Example: [{"check_id": "...", "status": "success", "qbo_id": "..."}, ...]
  
  -- User who initiated export
  exported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  exported_by_email TEXT,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_export_history_tenant ON export_history(tenant_id);
CREATE INDEX idx_export_history_batch ON export_history(batch_id);
CREATE INDEX idx_export_history_status ON export_history(status);
CREATE INDEX idx_export_history_type ON export_history(export_type);
CREATE INDEX idx_export_history_created ON export_history(created_at DESC);
CREATE INDEX idx_export_history_user ON export_history(exported_by) WHERE exported_by IS NOT NULL;

-- GIN indexes for arrays and JSONB
CREATE INDEX idx_export_history_checks ON export_history USING GIN(check_ids);
CREATE INDEX idx_export_history_results ON export_history USING GIN(check_results);

-- Comments
COMMENT ON TABLE export_history IS 'Tracks all export operations to accounting systems';
COMMENT ON COLUMN export_history.batch_id IS 'Groups multiple checks exported together';
COMMENT ON COLUMN export_history.check_results IS 'Per-check export results: [{"check_id": "...", "status": "success"}]';