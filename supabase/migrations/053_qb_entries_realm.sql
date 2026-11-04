-- 053: qb_entries records which QuickBooks company each row came from, so
-- syncing or disconnecting one company no longer touches another's rows.
--
-- '' means "no company": file imports, and rows written by an older extension.
-- A default rather than NOT NULL-with-no-default, so code deployed before this
-- migration keeps inserting.
ALTER TABLE public.qb_entries ADD COLUMN IF NOT EXISTS realm_id TEXT NOT NULL DEFAULT '';

-- Each tenant's rows came from its last sync, which ran on its active company.
UPDATE public.qb_entries e
   SET realm_id = c.realm_id
  FROM public.qb_connections c
 WHERE c.tenant_id = e.tenant_id
   AND c.is_active
   AND e.realm_id = ''
   AND e.qb_type <> 'FileImport';

-- Intuit ids repeat across companies and id is the primary key, so two companies
-- or firms could collide. New writes use this form; bring existing rows in line
-- so an upsert replaces them rather than duplicating them.
UPDATE public.qb_entries
   SET id = id || ':' || realm_id || ':' || tenant_id
 WHERE realm_id <> ''
   AND id NOT LIKE '%:%';

CREATE INDEX IF NOT EXISTS idx_qb_entries_tenant_realm ON public.qb_entries (tenant_id, realm_id);
