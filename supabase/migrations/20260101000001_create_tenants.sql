-- Tenants table for multi-tenant support
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Settings
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- QuickBooks integration settings (encrypted)
  qbo_realm_id TEXT,
  qbo_company_name TEXT,
  
  -- Subscription info
  plan TEXT DEFAULT 'free', -- 'free', 'starter', 'professional', 'enterprise'
  max_checks_per_month INTEGER DEFAULT 100,
  checks_used_this_month INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_plan ON tenants(plan);

-- Comments
COMMENT ON TABLE tenants IS 'Organizations/companies using the system';
COMMENT ON COLUMN tenants.settings IS 'JSON settings: { "auto_approve_threshold": 0.9, "notification_email": "..." }';
COMMENT ON COLUMN tenants.max_checks_per_month IS 'Monthly check processing limit based on plan';