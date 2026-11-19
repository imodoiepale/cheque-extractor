-- The extension's QB list reads qb_entries by tenant + realm, newest first, in
-- pages of 1000. This index serves that exactly (no sort over 5,000+ rows).
CREATE INDEX IF NOT EXISTS idx_qb_entries_tenant_realm_date
  ON public.qb_entries (tenant_id, realm_id, date DESC, id);
ANALYZE public.qb_entries;
