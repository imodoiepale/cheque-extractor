-- Analytics: Check processing statistics
CREATE VIEW analytics_processing_stats AS
SELECT 
  c.tenant_id,
  DATE(c.created_at) as date,
  COUNT(*) as total_checks,
  COUNT(*) FILTER (WHERE c.status = 'approved') as auto_approved,
  COUNT(*) FILTER (WHERE c.status IN ('review_required', 'review_suggested')) as requiring_review,
  COUNT(*) FILTER (WHERE c.status = 'exported') as exported,
  COUNT(*) FILTER (WHERE c.status = 'rejected') as rejected,
  AVG(c.confidence_summary) as avg_confidence,
  AVG(c.processing_duration_ms) as avg_processing_time_ms,
  SUM(c.amount) as total_amount
FROM checks c
WHERE c.deleted_at IS NULL
GROUP BY c.tenant_id, DATE(c.created_at);

COMMENT ON VIEW analytics_processing_stats IS 'Daily processing statistics per tenant';

-- Analytics: Field accuracy (comparing manual reviews)
CREATE VIEW analytics_field_accuracy AS
SELECT 
  c.tenant_id,
  DATE(c.reviewed_at) as date,
  'payee' as field_name,
  AVG(c.payee_confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE c.payee_source = 'manual') as manual_corrections
FROM checks c
WHERE c.reviewed_at IS NOT NULL AND c.deleted_at IS NULL
GROUP BY c.tenant_id, DATE(c.reviewed_at)

UNION ALL

SELECT 
  c.tenant_id,
  DATE(c.reviewed_at) as date,
  'amount' as field_name,
  AVG(c.amount_confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE c.amount_source = 'manual') as manual_corrections
FROM checks c
WHERE c.reviewed_at IS NOT NULL AND c.deleted_at IS NULL
GROUP BY c.tenant_id, DATE(c.reviewed_at)

UNION ALL

SELECT 
  c.tenant_id,
  DATE(c.reviewed_at) as date,
  'check_number' as field_name,
  AVG(c.check_number_confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE c.check_number_source = 'manual') as manual_corrections
FROM checks c
WHERE c.reviewed_at IS NOT NULL AND c.deleted_at IS NULL
GROUP BY c.tenant_id, DATE(c.reviewed_at);

COMMENT ON VIEW analytics_field_accuracy IS 'Field-level accuracy tracking';

-- Analytics: Export performance
CREATE VIEW analytics_export_stats AS
SELECT 
  eh.tenant_id,
  DATE(eh.created_at) as date,
  eh.export_type,
  COUNT(*) as total_exports,
  SUM(eh.successful_count) as successful_checks,
  SUM(eh.failed_count) as failed_checks,
  AVG(eh.duration_ms) as avg_export_time_ms,
  COUNT(*) FILTER (WHERE eh.status = 'success') as successful_exports,
  COUNT(*) FILTER (WHERE eh.status = 'failed') as failed_exports
FROM export_history eh
GROUP BY eh.tenant_id, DATE(eh.created_at), eh.export_type;

COMMENT ON VIEW analytics_export_stats IS 'Export operation statistics';

-- Analytics: User activity
CREATE VIEW analytics_user_activity AS
SELECT 
  al.tenant_id,
  al.user_id,
  up.full_name,
  up.email,
  DATE(al.created_at) as date,
  COUNT(*) as total_actions,
  COUNT(*) FILTER (WHERE al.action = 'reviewed') as reviews_completed,
  COUNT(*) FILTER (WHERE al.action = 'approved') as approvals,
  COUNT(*) FILTER (WHERE al.action = 'updated') as edits,
  COUNT(DISTINCT al.check_id) as checks_touched
FROM audit_logs al
LEFT JOIN user_profiles up ON al.user_id = up.id
WHERE al.user_id IS NOT NULL
GROUP BY al.tenant_id, al.user_id, up.full_name, up.email, DATE(al.created_at);

COMMENT ON VIEW analytics_user_activity IS 'Per-user activity metrics';

-- Materialized view for performance (refresh periodically)
CREATE MATERIALIZED VIEW analytics_daily_summary AS
SELECT 
  tenant_id,
  date,
  total_checks,
  auto_approved,
  requiring_review,
  exported,
  avg_confidence,
  avg_processing_time_ms,
  total_amount
FROM analytics_processing_stats;

CREATE UNIQUE INDEX idx_analytics_daily_summary ON analytics_daily_summary(tenant_id, date);

COMMENT ON MATERIALIZED VIEW analytics_daily_summary IS 'Pre-aggregated daily statistics (refresh nightly)';