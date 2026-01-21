-- Additional performance indexes

-- Checks: Common query patterns
CREATE INDEX idx_checks_tenant_status_confidence 
  ON checks(tenant_id, status, confidence_summary DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX idx_checks_recent_by_tenant 
  ON checks(tenant_id, created_at DESC) 
  WHERE deleted_at IS NULL 
  INCLUDE (status, confidence_summary, amount);

CREATE INDEX idx_checks_pending_export 
  ON checks(tenant_id, created_at DESC) 
  WHERE status = 'approved' AND exported = FALSE AND deleted_at IS NULL;

CREATE INDEX idx_checks_qbo_sync_pending 
  ON checks(tenant_id) 
  WHERE qbo_synced = FALSE AND exported = TRUE AND deleted_at IS NULL;

-- Processing stages: Real-time queries
CREATE INDEX idx_processing_stages_active 
  ON processing_stages(check_id, updated_at DESC) 
  WHERE status IN ('pending', 'processing');

-- Audit logs: Performance queries
CREATE INDEX idx_audit_logs_recent 
  ON audit_logs(tenant_id, created_at DESC) 
  INCLUDE (action, user_email, table_name);

CREATE INDEX idx_audit_logs_check_history 
  ON audit_logs(check_id, created_at DESC) 
  WHERE check_id IS NOT NULL;

-- Export history: Recent exports
CREATE INDEX idx_export_history_recent 
  ON export_history(tenant_id, created_at DESC) 
  WHERE status IN ('success', 'partial_success');

-- User profiles: Active users
CREATE INDEX idx_user_profiles_active 
  ON user_profiles(tenant_id, last_activity_at DESC) 
  WHERE status = 'active';

-- Covering indexes for common SELECT queries
CREATE INDEX idx_checks_dashboard 
  ON checks(tenant_id, status, created_at DESC) 
  WHERE deleted_at IS NULL
  INCLUDE (check_number, payee, amount, confidence_summary);

CREATE INDEX idx_checks_review_queue 
  ON checks(tenant_id, confidence_summary ASC, created_at ASC) 
  WHERE status IN ('review_required', 'review_suggested') AND deleted_at IS NULL
  INCLUDE (check_number, payee, amount);