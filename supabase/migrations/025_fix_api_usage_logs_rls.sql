-- ============================================================================
-- Fix tenant isolation on api_usage_logs
--
-- 012_add_api_usage_tracking.sql created:
--   CREATE POLICY "service_all" ON api_usage_logs FOR ALL USING (true) WITH CHECK (true);
--
-- That policy has no TO clause, so it applies to every role including
-- `authenticated`. Because permissive policies combine with OR, it grants
-- every signed-in user full read/write access to every tenant's usage rows
-- (tenant_id, job_id, check_id, token counts, costs) via the anon key.
--
-- 005_add_user_rls_policies.sql already dropped the equivalent policies on the
-- nine tables created in 001. api_usage_logs was added afterwards and missed
-- that cleanup. This migration applies the same pattern used in 005 and 013.
-- ============================================================================

DROP POLICY IF EXISTS "service_all" ON api_usage_logs;

-- Tenant members may read their own firm's usage (the billing page needs this).
CREATE POLICY "Users can view own tenant api usage"
  ON api_usage_logs FOR SELECT
  USING (tenant_id = public.user_tenant_id());

-- Writes come from the backend extraction pipeline only, never the browser.
CREATE POLICY "Service role full access to api_usage_logs"
  ON api_usage_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
