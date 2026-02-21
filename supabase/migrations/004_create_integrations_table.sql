-- Create integrations table for storing OAuth tokens and API keys
CREATE TABLE IF NOT EXISTS integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  realm_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  -- QuickBooks OAuth credentials (stored in DB instead of env vars)
  qb_client_id TEXT,
  qb_client_secret TEXT,
  qb_redirect_uri TEXT,
  -- Other API keys
  gemini_api_key TEXT,
  api_keys JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider)
);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create policy for service role (backend can manage all integrations)
CREATE POLICY "Service role can manage integrations"
  ON integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_realm_id ON integrations(realm_id);

-- Add comment
COMMENT ON TABLE integrations IS 'Stores OAuth tokens and API keys for third-party integrations (QuickBooks, etc.)';
