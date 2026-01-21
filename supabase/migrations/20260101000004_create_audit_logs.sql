-- Audit logs for all changes
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What was changed
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- Type of action
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'exported', 'reviewed', 'approved', 'rejected'
  
  -- For checks table specifically
  check_id UUID REFERENCES checks(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Field-level tracking
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  
  -- Full change record
  changes JSONB, -- {"field": {"old": "...", "new": "..."}, ...}
  
  -- Who made the change
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  
  -- How it was changed
  source TEXT, -- 'web_ui', 'api', 'system', 'import'
  ip_address INET,
  user_agent TEXT,
  
  -- Why it was changed
  reason TEXT,
  notes TEXT,
  
  -- Request metadata
  request_id TEXT, -- For correlating related actions
  session_id TEXT,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_logs_check ON audit_logs(check_id) WHERE check_id IS NOT NULL;
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_request ON audit_logs(request_id) WHERE request_id IS NOT NULL;

-- GIN index for JSONB
CREATE INDEX idx_audit_logs_changes ON audit_logs USING GIN(changes);

-- Partitioning setup (for large datasets - optional)
-- CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Comments
COMMENT ON TABLE audit_logs IS 'Complete audit trail of all system changes';
COMMENT ON COLUMN audit_logs.changes IS 'Full change record: {"payee": {"old": "ACME", "new": "ACME Corp"}}';
COMMENT ON COLUMN audit_logs.request_id IS 'Groups related changes from single request';