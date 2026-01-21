-- Notify on check status changes (for real-time UI)
CREATE OR REPLACE FUNCTION notify_check_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify(
      'check_status_changed',
      json_build_object(
        'check_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'confidence', NEW.confidence_summary
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_status_notification
  AFTER UPDATE ON checks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION notify_check_status_change();

-- Notify on processing stage updates
CREATE OR REPLACE FUNCTION notify_processing_stage_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'processing_stage_updated',
    json_build_object(
      'check_id', NEW.check_id,
      'stage_name', NEW.stage_name,
      'status', NEW.status,
      'progress', NEW.progress,
      'stage_data', NEW.stage_data
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER processing_stage_notification
  AFTER INSERT OR UPDATE ON processing_stages
  FOR EACH ROW
  EXECUTE FUNCTION notify_processing_stage_update();

-- Validate check amount doesn't exceed reasonable limits
CREATE OR REPLACE FUNCTION validate_check_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Reject checks over $1,000,000 (configurable)
  IF NEW.amount > 1000000 THEN
    RAISE EXCEPTION 'Check amount exceeds maximum allowed: %', NEW.amount;
  END IF;
  
  -- Reject negative amounts
  IF NEW.amount < 0 THEN
    RAISE EXCEPTION 'Check amount cannot be negative: %', NEW.amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_check_amount_trigger
  BEFORE INSERT OR UPDATE ON checks
  FOR EACH ROW
  WHEN (NEW.amount IS NOT NULL)
  EXECUTE FUNCTION validate_check_amount();

-- Prevent deletion of exported checks
CREATE OR REPLACE FUNCTION prevent_exported_check_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.exported = TRUE AND OLD.qbo_synced = TRUE THEN
    RAISE EXCEPTION 'Cannot delete check that has been exported to QuickBooks: %', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_exported_deletion
  BEFORE DELETE ON checks
  FOR EACH ROW
  EXECUTE FUNCTION prevent_exported_check_deletion();