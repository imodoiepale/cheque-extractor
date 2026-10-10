-- ============================================================================
-- 038: Indexes for every unindexed foreign key, plus the hot read paths.
--
-- pg_stat_user_tables showed check_jobs read by sequential scan 3,835 times;
-- every page filters it by tenant_id, which had no index. Postgres does not
-- index foreign keys automatically, so the RLS predicate
-- (tenant_id = user_tenant_id()) and every ON DELETE walked whole tables.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS throughout. Safe to run twice.
-- ============================================================================

-- Tenant scoping (the RLS predicate on every user query).
CREATE INDEX IF NOT EXISTS idx_check_jobs_tenant_created  ON public.check_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qb_entries_tenant          ON public.qb_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_entries_tenant  ON public.quickbooks_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_tenant        ON public.app_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_processing_stages_tenant   ON public.processing_stages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_tenant  ON public.mfa_recovery_codes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_tenant       ON public.stripe_events (tenant_id);

-- Hot read paths: review screens, matches by status, checks by job.
CREATE INDEX IF NOT EXISTS idx_checks_tenant_batch        ON public.checks (tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_checks_tenant_number       ON public.checks (tenant_id, check_number);
CREATE INDEX IF NOT EXISTS idx_matches_tenant_status      ON public.matches (tenant_id, status, confidence_score);

-- Remaining foreign keys (user / actor columns, cascades and audit joins).
CREATE INDEX IF NOT EXISTS idx_checks_user                ON public.checks (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user            ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_export_history_user        ON public.export_history (user_id);
CREATE INDEX IF NOT EXISTS idx_vouched_checks_vouched_by  ON public.vouched_checks (vouched_by);
CREATE INDEX IF NOT EXISTS idx_qb_connections_user        ON public.qb_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_qb_transactions_user       ON public.qb_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user               ON public.matches (user_id);
CREATE INDEX IF NOT EXISTS idx_matches_qb_txn             ON public.matches (qb_txn_id);
CREATE INDEX IF NOT EXISTS idx_matches_resolved_by        ON public.matches (resolved_by);
CREATE INDEX IF NOT EXISTS idx_matches_approved_by        ON public.matches (approved_by);
CREATE INDEX IF NOT EXISTS idx_match_audit_log_user       ON public.match_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_upload_fingerprints_user   ON public.upload_fingerprints (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_user          ON public.usage_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_comp_grants_granted_by     ON public.comp_grants (granted_by);
CREATE INDEX IF NOT EXISTS idx_comp_grants_revoked_by     ON public.comp_grants (revoked_by);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invited_by ON public.team_invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_batches_approved_by        ON public.batches (approved_by);
CREATE INDEX IF NOT EXISTS idx_billing_refunds_refunded_by ON public.billing_refunds (refunded_by);

ANALYZE public.check_jobs, public.checks, public.matches, public.qb_entries, public.qb_transactions;

-- ── audit_logs drift ────────────────────────────────────────────────────────
-- 001_schema.sql declares (field, old_value, new_value, job_id), but the live
-- table was created with (entity_type, entity_id, old_values, new_values). The
-- triggers from 029 (comp grants), 033 (refunds) and 037 (one trial per QB
-- company) and pages/api/checks/[id]/update.ts write the singular names, so
-- every one of those inserts failed. Adding the columns repairs all of them
-- without rewriting the triggers; nothing reads them as required.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS field     TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS job_id    TEXT;

-- Make PostgREST see functions and tables added by earlier migrations
-- (report_summary() was reported "missing" until this ran).
NOTIFY pgrst, 'reload schema';
