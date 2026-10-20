-- Create qb_entries table for storing synced QuickBooks cheque data
CREATE TABLE IF NOT EXISTS qb_entries (
  id TEXT PRIMARY KEY,
  qb_type TEXT NOT NULL,          -- 'Purchase', 'BillPayment', 'Payment'
  qb_source TEXT NOT NULL,        -- 'cheque_written', 'bill_paid_by_cheque', 'cheque_received'
  check_number TEXT DEFAULT '',
  date TEXT DEFAULT '',
  amount TEXT DEFAULT '0',
  payee TEXT DEFAULT '',
  account TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to integrations table if they don't exist.
-- On a fresh database the table does not exist yet (it is created further down,
-- with these same columns), so only touch it when it is already there.
DO $$
BEGIN
  IF to_regclass('public.integrations') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'integrations' AND column_name = 'qb_client_id') THEN
    ALTER TABLE integrations ADD COLUMN qb_client_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'integrations' AND column_name = 'qb_client_secret') THEN
    ALTER TABLE integrations ADD COLUMN qb_client_secret TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'integrations' AND column_name = 'qb_redirect_uri') THEN
    ALTER TABLE integrations ADD COLUMN qb_redirect_uri TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'integrations' AND column_name = 'gemini_api_key') THEN
    ALTER TABLE integrations ADD COLUMN gemini_api_key TEXT;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE qb_entries ENABLE ROW LEVEL SECURITY;

-- Service role can manage qb_entries
DROP POLICY IF EXISTS "Service role can manage qb_entries" ON qb_entries;
CREATE POLICY "Service role can manage qb_entries"
  ON qb_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_qb_entries_date ON qb_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_qb_entries_qb_source ON qb_entries (qb_source);
CREATE INDEX IF NOT EXISTS idx_qb_entries_check_number ON qb_entries (check_number);


-- ------------------------------------------------------------------------
-- Merged from 004a_create_integrations_table.sql
-- 
-- Originally shipped as a second file also numbered 004. Supabase keys its
-- migration ledger on the version alone, so two files numbered 004 can never
-- both be recorded, and a non-numeric suffix is skipped outright. Folded in
-- here. It must stay ahead of 008, which adds a column to this table.
-- ------------------------------------------------------------------------

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
DROP POLICY IF EXISTS "Service role can manage integrations" ON integrations;
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
