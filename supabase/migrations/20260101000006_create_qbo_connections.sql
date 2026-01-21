-- QuickBooks OAuth connections
CREATE TABLE qbo_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- QBO company information
  realm_id TEXT NOT NULL, -- QBO company ID
  company_name TEXT,
  company_country TEXT,
  company_currency TEXT DEFAULT 'USD',
  
  -- OAuth tokens (encrypted)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  
  -- Token expiration
  access_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Scopes granted
  scopes TEXT[] DEFAULT ARRAY['com.intuit.quickbooks.accounting'],
  
  -- Connection status
  status TEXT DEFAULT 'active', -- 'active', 'expired', 'revoked', 'error'
  
  -- Last sync information
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status TEXT,
  last_sync_error TEXT,
  
  -- Environment
  environment TEXT DEFAULT 'production', -- 'sandbox', 'production'
  
  -- Connection metadata
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_by_email TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  disconnected_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE UNIQUE INDEX idx_qbo_connections_tenant_active 
  ON qbo_connections(tenant_id) 
  WHERE status = 'active' AND disconnected_at IS NULL;

CREATE INDEX idx_qbo_connections_realm ON qbo_connections(realm_id);
CREATE INDEX idx_qbo_connections_status ON qbo_connections(status);
CREATE INDEX idx_qbo_connections_expires ON qbo_connections(access_token_expires_at) 
  WHERE status = 'active';

-- Comments
COMMENT ON TABLE qbo_connections IS 'QuickBooks OAuth connection data (tokens encrypted)';
COMMENT ON COLUMN qbo_connections.realm_id IS 'QuickBooks company identifier';
COMMENT ON COLUMN qbo_connections.access_token IS 'Encrypted OAuth access token';
COMMENT ON COLUMN qbo_connections.refresh_token IS 'Encrypted OAuth refresh token';

-- Security: Encrypt sensitive columns (requires pgcrypto extension)
-- Note: In production, use application-level encryption or Supabase Vault