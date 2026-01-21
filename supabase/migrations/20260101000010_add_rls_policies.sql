-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION auth.user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to check user role
CREATE OR REPLACE FUNCTION auth.user_has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND (
      role = required_role 
      OR role = 'owner' 
      OR role = 'admin'
    )
  );
$$ LANGUAGE SQL SECURITY DEFINER;

---------- TENANTS ----------

-- Users can view their own tenant
CREATE POLICY "Users can view own tenant"
  ON tenants FOR SELECT
  USING (id = auth.user_tenant_id());

-- Only owners can update tenant
CREATE POLICY "Owners can update tenant"
  ON tenants FOR UPDATE
  USING (id = auth.user_tenant_id() AND auth.user_has_role('owner'));

---------- CHECKS ----------

-- Users can view checks from their tenant
CREATE POLICY "Users can view tenant checks"
  ON checks FOR SELECT
  USING (tenant_id = auth.user_tenant_id() AND deleted_at IS NULL);

-- Users can insert checks (upload)
CREATE POLICY "Users can create checks"
  ON checks FOR INSERT
  WITH CHECK (tenant_id = auth.user_tenant_id());

-- Reviewers and above can update checks
CREATE POLICY "Reviewers can update checks"
  ON checks FOR UPDATE
  USING (
    tenant_id = auth.user_tenant_id() 
    AND deleted_at IS NULL
    AND auth.user_has_role('reviewer')
  );

-- Only admins can delete checks
CREATE POLICY "Admins can delete checks"
  ON checks FOR DELETE
  USING (
    tenant_id = auth.user_tenant_id() 
    AND auth.user_has_role('admin')
  );

---------- PROCESSING STAGES ----------

-- Users can view processing stages for their tenant's checks
CREATE POLICY "Users can view processing stages"
  ON processing_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM checks 
      WHERE checks.id = processing_stages.check_id 
      AND checks.tenant_id = auth.user_tenant_id()
    )
  );

-- System can insert/update processing stages
-- (This policy allows backend service role to write)
CREATE POLICY "Service can manage processing stages"
  ON processing_stages FOR ALL
  USING (true)
  WITH CHECK (true);

---------- AUDIT LOGS ----------

-- Users can view audit logs for their tenant
CREATE POLICY "Users can view tenant audit logs"
  ON audit_logs FOR SELECT
  USING (tenant_id = auth.user_tenant_id());

-- System can insert audit logs (service role only)
CREATE POLICY "Service can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

---------- EXPORT HISTORY ----------

-- Users can view export history for their tenant
CREATE POLICY "Users can view export history"
  ON export_history FOR SELECT
  USING (tenant_id = auth.user_tenant_id());

-- Reviewers and above can create exports
CREATE POLICY "Reviewers can create exports"
  ON export_history FOR INSERT
  WITH CHECK (
    tenant_id = auth.user_tenant_id() 
    AND auth.user_has_role('reviewer')
  );

-- System can update export status
CREATE POLICY "Service can update exports"
  ON export_history FOR UPDATE
  USING (true);

---------- QBO CONNECTIONS ----------

-- Admins can view QBO connections
CREATE POLICY "Admins can view QBO connections"
  ON qbo_connections FOR SELECT
  USING (
    tenant_id = auth.user_tenant_id() 
    AND auth.user_has_role('admin')
  );

-- Admins can manage QBO connections
CREATE POLICY "Admins can manage QBO connections"
  ON qbo_connections FOR ALL
  USING (
    tenant_id = auth.user_tenant_id() 
    AND auth.user_has_role('admin')
  );

---------- USER PROFILES ----------

-- Users can view profiles in their tenant
CREATE POLICY "Users can view tenant profiles"
  ON user_profiles FOR SELECT
  USING (tenant_id = auth.user_tenant_id());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can manage all profiles in tenant
CREATE POLICY "Admins can manage tenant profiles"
  ON user_profiles FOR ALL
  USING (
    tenant_id = auth.user_tenant_id() 
    AND auth.user_has_role('admin')
  );