-- Migration 022: Add intuit_id column to qb_entries
-- intuit_id stores the raw Intuit entity ID (e.g. "614") extracted from the
-- compound id field (e.g. "purchase-614"). Storing it separately eliminates
-- string-parsing in APPROVE_AND_CLEAR and SAVE_QB_TXN handlers.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'qb_entries' AND column_name = 'intuit_id'
  ) THEN
    ALTER TABLE qb_entries ADD COLUMN intuit_id TEXT;
  END IF;
END $$;

-- Back-fill existing rows: extract everything after the first dash in the id
-- e.g. "purchase-614" → "614", "billpayment-456" → "456"
UPDATE qb_entries
SET intuit_id = substring(id from position('-' in id) + 1)
WHERE intuit_id IS NULL AND id LIKE '%-%';

-- Index for lookups by intuit_id + tenant
CREATE INDEX IF NOT EXISTS idx_qb_entries_intuit_id ON qb_entries (intuit_id);
