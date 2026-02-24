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

-- Add columns to integrations table if they don't exist
DO $$
BEGIN
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
