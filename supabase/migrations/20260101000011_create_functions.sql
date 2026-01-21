-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checks_updated_at BEFORE UPDATE ON checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_stages_updated_at BEFORE UPDATE ON processing_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_export_history_updated_at BEFORE UPDATE ON export_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qbo_connections_updated_at BEFORE UPDATE ON qbo_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function: Create audit log automatically on check changes
CREATE OR REPLACE FUNCTION create_check_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  changes JSONB := '{}'::jsonb;
  field_name TEXT;
  old_val TEXT;
  new_val TEXT;
BEGIN
  -- Only for UPDATE operations
  IF TG_OP = 'UPDATE' THEN
    -- Compare each field
    FOR field_name IN 
      SELECT column_name::text 
      FROM information_schema.columns 
      WHERE table_name = 'checks' 
      AND column_name NOT IN ('id', 'created_at', 'updated_at', 'deleted_at')
    LOOP
      EXECUTE format('SELECT ($1).%I::text', field_name) INTO old_val USING OLD;
      EXECUTE format('SELECT ($1).%I::text', field_name) INTO new_val USING NEW;
      
      IF old_val IS DISTINCT FROM new_val THEN
        changes := changes || jsonb_build_object(
          field_name, 
          jsonb_build_object('old', old_val, 'new', new_val)
        );
      END IF;
    END LOOP;
    
    -- Only insert if there were actual changes
    IF changes != '{}'::jsonb THEN
      INSERT INTO audit_logs (
        table_name,
        record_id,
        check_id,
        tenant_id,
        action,
        changes,
        user_id
      ) VALUES (
        'checks',
        NEW.id,
        NEW.id,
        NEW.tenant_id,
        'updated',
        changes,
        auth.uid()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_audit_trigger
  AFTER UPDATE ON checks
  FOR EACH ROW
  EXECUTE FUNCTION create_check_audit_log();

-- Function: Calculate processing duration
CREATE OR REPLACE FUNCTION calculate_processing_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.processing_completed_at IS NOT NULL AND NEW.processing_started_at IS NOT NULL THEN
    NEW.processing_duration_ms := EXTRACT(EPOCH FROM (NEW.processing_completed_at - NEW.processing_started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_check_duration
  BEFORE UPDATE ON checks
  FOR EACH ROW
  WHEN (NEW.processing_completed_at IS NOT NULL)
  EXECUTE FUNCTION calculate_processing_duration();

-- Function: Increment monthly check usage
CREATE OR REPLACE FUNCTION increment_check_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tenants 
  SET checks_used_this_month = checks_used_this_month + 1
  WHERE id = NEW.tenant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_tenant_usage
  AFTER INSERT ON checks
  FOR EACH ROW
  EXECUTE FUNCTION increment_check_usage();

-- Function: Reset monthly usage (call via cron monthly)
CREATE OR REPLACE FUNCTION reset_monthly_check_usage()
RETURNS void AS $$
BEGIN
  UPDATE tenants SET checks_used_this_month = 0;
END;
$$ LANGUAGE plpgsql;

-- Function: Soft delete (sets deleted_at instead of removing)
CREATE OR REPLACE FUNCTION soft_delete_check(check_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE checks 
  SET deleted_at = NOW(), 
      status = 'deleted'
  WHERE id = check_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get check statistics for tenant
CREATE OR REPLACE FUNCTION get_tenant_check_stats(p_tenant_id UUID)
RETURNS TABLE (
  total_checks BIGINT,
  approved BIGINT,
  pending_review BIGINT,
  exported BIGINT,
  avg_confidence NUMERIC,
  total_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'approved')::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('review_required', 'review_suggested'))::BIGINT,
    COUNT(*) FILTER (WHERE exported = TRUE)::BIGINT,
    AVG(confidence_summary),
    SUM(amount)
  FROM checks
  WHERE tenant_id = p_tenant_id 
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;