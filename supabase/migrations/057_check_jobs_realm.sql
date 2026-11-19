-- Each upload belongs to one QuickBooks company. The extension sets it at
-- upload and only matches the active company's checks. NULL = older upload,
-- shown for every company.
ALTER TABLE public.check_jobs ADD COLUMN IF NOT EXISTS realm_id text;
CREATE INDEX IF NOT EXISTS idx_check_jobs_realm ON public.check_jobs (tenant_id, realm_id);
