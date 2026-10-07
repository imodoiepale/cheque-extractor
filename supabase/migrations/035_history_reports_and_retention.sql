-- ============================================================================
-- Migration 035: History, Reports and upload retention (CHECKLIST section 13)
--
-- Three things live here:
--
--   1. public.upload_retention — the durable record of which uploaded source
--      PDF is to be deleted and WHEN. 14 days, counted from the moment the
--      reconciliation COMPLETED, not from upload: a firm that pauses mid-month
--      would otherwise lose files it still needs. Michael asked 7 or 14; 14 is
--      the agreed default.
--
--      The row is written by a trigger when a batch moves to 'complete', so the
--      promise cannot be forgotten by an API path that skipped a helper. Only
--      the source PDF is ever in scope — the extracted cheque data, the check
--      images, the OCR JSON and the batch itself are not recorded here and are
--      never touched by the sweep.
--
--   2. public.report_summary() — ONE read-only aggregator behind the Reports
--      page. It adds no new storage: every figure is counted out of batches,
--      checks, matches, usage_ledger (027) and export_history (001). It reports
--      which of those tables it actually found, so a figure is never silently
--      zero because a migration was not applied.
--
--   3. Nothing for History — History reads GET /api/batches, which already
--      exists (migration 032). There is deliberately no second list.
--
-- Idempotent: safe to re-run. Safe to apply on a database where migrations
-- 026-034 were never applied: every reference to a table those added is behind
-- a to_regclass() guard, and a plpgsql branch that is not taken is never
-- planned, so a missing table costs a NULL figure rather than an error.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- 0. Prerequisites earlier migrations may not have applied.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    profile_table TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'user_tenant_id'
    ) THEN
        SELECT table_name INTO profile_table
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('user_profiles', 'profiles')
        ORDER BY CASE table_name WHEN 'user_profiles' THEN 0 ELSE 1 END
        LIMIT 1;

        IF profile_table IS NULL THEN
            RAISE EXCEPTION '035: no user_profiles/profiles table — cannot build tenant RLS';
        END IF;

        EXECUTE format($f$
            CREATE OR REPLACE FUNCTION public.user_tenant_id()
            RETURNS UUID AS $body$
              SELECT tenant_id FROM public.%I WHERE id = auth.uid()
            $body$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
        $f$, profile_table);

        GRANT EXECUTE ON FUNCTION public.user_tenant_id() TO authenticated, anon;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART 1 — UPLOAD RETENTION
-- ============================================================================

-- The retention window, in ONE place. A function rather than a constant in the
-- application so the sweep, the trigger and anyone reading the schema all see
-- the same 14. frontend/lib/retention.ts carries the same number and
-- scripts/check-history-reports.ts asserts the two agree.
CREATE OR REPLACE FUNCTION public.upload_retention_days()
RETURNS INTEGER AS $$ SELECT 14 $$ LANGUAGE SQL IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.upload_retention_days() TO authenticated;


-- One row per uploaded source PDF that is due for deletion.
--
-- `storage_prefix` is the job folder, and the sweep deletes only objects
-- DIRECTLY inside it whose name ends in .pdf. That is why the extracted data
-- survives: images/, pages/ and ocr_results/ are sub-folders, not direct
-- children, and extraction_summary.json is not a .pdf. Nothing in this table
-- references a checks, matches or batches row for deletion.
CREATE TABLE IF NOT EXISTS public.upload_retention (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- What the file belongs to. Both nullable-safe on delete: losing the batch
    -- must not lose the obligation to delete the file.
    batch_id        UUID,
    job_id          TEXT NOT NULL,

    -- Where the file is. Bucket + folder are what the sweep lists; the exact
    -- object path is kept for the audit trail, and is not trusted as the only
    -- way to find the file (upload-time filename mangling has happened).
    storage_bucket  TEXT NOT NULL DEFAULT 'checks',
    storage_prefix  TEXT NOT NULL,
    storage_path    TEXT,
    pdf_url         TEXT,

    -- When. delete_after = reconciliation completion + upload_retention_days().
    completed_at    TIMESTAMPTZ NOT NULL,
    delete_after    TIMESTAMPTZ NOT NULL,

    status          TEXT NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    objects_deleted INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    deleted_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.upload_retention DROP CONSTRAINT IF EXISTS upload_retention_status_check;
ALTER TABLE public.upload_retention ADD CONSTRAINT upload_retention_status_check
    -- 'deleted'  the file was removed.
    -- 'missing'  the file was already gone. That is a SUCCESS, not a failure:
    --            a sweep that ran twice, or an operator who tidied the bucket,
    --            must not leave a row retrying forever.
    -- 'failed'   storage refused. Retried on the next sweep.
    CHECK (status IN ('pending', 'deleted', 'missing', 'failed'));

-- THE idempotency guarantee for scheduling: one obligation per file, ever.
-- Completing a batch twice, re-running this migration's backfill, or two
-- requests racing the trigger all collide here instead of queuing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS upload_retention_object_uniq
    ON public.upload_retention (tenant_id, storage_bucket, storage_prefix, job_id);

-- The sweep's one query: pending rows whose time has come, oldest first.
CREATE INDEX IF NOT EXISTS idx_upload_retention_due
    ON public.upload_retention (delete_after)
    WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_upload_retention_tenant
    ON public.upload_retention (tenant_id, delete_after DESC);
CREATE INDEX IF NOT EXISTS idx_upload_retention_batch
    ON public.upload_retention (batch_id);

DROP TRIGGER IF EXISTS upload_retention_updated_at ON public.upload_retention;
CREATE TRIGGER upload_retention_updated_at
    BEFORE UPDATE ON public.upload_retention
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ──────────────────────────────────────────────────────────────────────────────
-- Scheduling: record every source PDF of a completed batch.
--
-- SECURITY DEFINER because it is called from a trigger on batches, which a
-- tenant user owns, while upload_retention is service-managed.
--
-- ON CONFLICT DO NOTHING, so calling it again for the same batch is a no-op
-- rather than an error or a second obligation. Returns the number of NEW rows.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.schedule_upload_retention(p_batch_id UUID)
RETURNS INTEGER AS $$
DECLARE
    _n INTEGER := 0;
BEGIN
    IF p_batch_id IS NULL THEN RETURN 0; END IF;
    IF to_regclass('public.batches') IS NULL
       OR to_regclass('public.check_jobs') IS NULL THEN
        RETURN 0;
    END IF;

    WITH src AS (
        SELECT
            b.tenant_id,
            b.id                                   AS batch_id,
            j.job_id,
            COALESCE(NULLIF(split_part(split_part(j.pdf_url, '/object/public/', 2), '/', 1), ''),
                     'checks')                     AS bucket,
            'jobs/' || j.job_id                    AS prefix,
            NULLIF(regexp_replace(split_part(j.pdf_url, '/object/public/', 2),
                                  '^[^/]+/', ''), '') AS object_path,
            j.pdf_url,
            COALESCE(b.completed_at, NOW())        AS completed_at
        FROM public.batches b
        JOIN public.check_jobs j ON j.batch_id = b.id
        WHERE b.id = p_batch_id
          AND j.pdf_url IS NOT NULL
    )
    INSERT INTO public.upload_retention (
        tenant_id, batch_id, job_id, storage_bucket, storage_prefix,
        storage_path, pdf_url, completed_at, delete_after
    )
    SELECT
        s.tenant_id, s.batch_id, s.job_id, s.bucket, s.prefix,
        s.object_path, s.pdf_url, s.completed_at,
        s.completed_at + (public.upload_retention_days() || ' days')::interval
    FROM src s
    ON CONFLICT (tenant_id, storage_bucket, storage_prefix, job_id) DO NOTHING;

    GET DIAGNOSTICS _n = ROW_COUNT;
    RETURN _n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- The trigger. Fires once, on the transition INTO 'complete'.
CREATE OR REPLACE FUNCTION public.batches_schedule_retention()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'complete'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'complete') THEN
        PERFORM public.schedule_upload_retention(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
    IF to_regclass('public.batches') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS batches_schedule_retention ON public.batches;
        CREATE TRIGGER batches_schedule_retention
            AFTER INSERT OR UPDATE OF status ON public.batches
            FOR EACH ROW EXECUTE FUNCTION public.batches_schedule_retention();
    ELSE
        RAISE WARNING '035: batches missing (migration 032 not applied) — retention will not be scheduled until it is';
    END IF;
END $$;

-- Backfill: batches that completed before this migration existed still owe the
-- firm a deletion. Same ON CONFLICT, so re-running costs nothing.
DO $$
DECLARE
    b RECORD;
BEGIN
    IF to_regclass('public.batches') IS NOT NULL
       AND to_regclass('public.check_jobs') IS NOT NULL THEN
        FOR b IN SELECT id FROM public.batches WHERE status = 'complete' LOOP
            PERFORM public.schedule_upload_retention(b.id);
        END LOOP;
    END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────────
-- The sweep's two RPCs. Both service-role only: deleting a customer's file is
-- not a tenant-user action.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upload_retention_due(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    id             UUID,
    tenant_id      UUID,
    batch_id       UUID,
    job_id         TEXT,
    storage_bucket TEXT,
    storage_prefix TEXT,
    storage_path   TEXT,
    delete_after   TIMESTAMPTZ,
    attempts       INTEGER
) AS $$
    SELECT r.id, r.tenant_id, r.batch_id, r.job_id, r.storage_bucket,
           r.storage_prefix, r.storage_path, r.delete_after, r.attempts
      FROM public.upload_retention r
     -- 'deleted' and 'missing' are terminal, so a second sweep over the same
     -- window returns nothing to do. This predicate IS the sweep's idempotency.
     WHERE r.status IN ('pending', 'failed')
       AND r.delete_after <= NOW()
     ORDER BY r.delete_after ASC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.upload_retention_due(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upload_retention_due(INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_retention_due(INTEGER) TO service_role;


-- Record the outcome of one deletion.
--
-- Idempotent twice over: a row already in a terminal state is returned
-- unchanged (no error, no second audit row), and 'missing' — the file was
-- already gone — is recorded as a success.
--
-- The source PDF's URL is cleared off check_jobs so the UI stops offering a
-- link to a file that no longer exists. Nothing else on check_jobs is touched:
-- pdf_name, total_checks, checks_data and every checks/matches/batches row stay
-- exactly as they were, which is the whole point of "keep the extracted data
-- and the history".
CREATE OR REPLACE FUNCTION public.complete_upload_retention(
    p_id              UUID,
    p_outcome         TEXT,
    p_objects_deleted INTEGER DEFAULT 0,
    p_error           TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    _row public.upload_retention;
BEGIN
    IF p_outcome NOT IN ('deleted', 'missing', 'failed') THEN
        RAISE EXCEPTION 'complete_upload_retention: outcome must be deleted, missing or failed';
    END IF;

    SELECT * INTO _row FROM public.upload_retention WHERE id = p_id;
    IF _row.id IS NULL THEN
        RETURN jsonb_build_object('ok', FALSE, 'reason', 'not_found');
    END IF;
    IF _row.status IN ('deleted', 'missing') THEN
        -- Already settled. A repeated sweep is a no-op, not an error.
        RETURN jsonb_build_object('ok', TRUE, 'already_settled', TRUE, 'status', _row.status);
    END IF;

    UPDATE public.upload_retention
       SET status          = p_outcome,
           attempts        = attempts + 1,
           objects_deleted = COALESCE(p_objects_deleted, 0),
           last_error      = CASE WHEN p_outcome = 'failed' THEN p_error ELSE NULL END,
           deleted_at      = CASE WHEN p_outcome IN ('deleted', 'missing') THEN NOW() ELSE NULL END
     WHERE id = p_id;

    IF p_outcome IN ('deleted', 'missing')
       AND to_regclass('public.check_jobs') IS NOT NULL THEN
        UPDATE public.check_jobs
           SET pdf_url = NULL
         WHERE job_id = _row.job_id
           AND pdf_url IS NOT NULL;
    END IF;

    RETURN jsonb_build_object('ok', TRUE, 'already_settled', FALSE, 'status', p_outcome);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.complete_upload_retention(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_upload_retention(UUID, TEXT, INTEGER, TEXT)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_upload_retention(UUID, TEXT, INTEGER, TEXT)
    TO service_role;


-- RLS. A firm may READ its own retention schedule — "your files go on the 14th"
-- is information the firm is owed. Nobody but the service role may write it.
ALTER TABLE public.upload_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant reads own upload_retention" ON public.upload_retention;
CREATE POLICY "Tenant reads own upload_retention"
    ON public.upload_retention FOR SELECT
    TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to upload_retention" ON public.upload_retention;
CREATE POLICY "Service role full access to upload_retention"
    ON public.upload_retention FOR ALL
    TO service_role
    USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT ON public.upload_retention TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.upload_retention FROM authenticated;
REVOKE ALL ON public.upload_retention FROM anon;


-- ============================================================================
-- PART 2 — REPORTS
--
-- One read-only aggregator. No new tables, no materialised rollup: the numbers
-- are counted out of the rows that already exist, so a report can never drift
-- from the data it describes.
--
-- Date semantics, stated once because a report that is vague about its window
-- is worse than no report:
--
--   * batches are included when their PERIOD OVERLAPS [p_from, p_to] —
--     period_start <= p_to AND period_end >= p_from. That is what an
--     accountant means by "August", not "the row was touched in August".
--   * usage_ledger rows are included by occurred_at, the moment the cheque was
--     processed.
--   * export_history rows are included by created_at, and are NOT narrowed by
--     the company or account filter: export_history has no batch link today, so
--     narrowing it would silently drop every export. `exports.scope` says so.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.report_summary(
    p_tenant_id UUID,
    p_from      DATE,
    p_to        DATE,
    p_realm_id  TEXT DEFAULT NULL,
    p_account   TEXT DEFAULT NULL,
    p_batch_id  UUID DEFAULT NULL,
    p_row_limit INTEGER DEFAULT 50
)
RETURNS JSONB AS $$
DECLARE
    _claims     TEXT := current_setting('request.jwt.claims', TRUE);
    _is_service BOOLEAN;
    _ids        UUID[] := '{}'::uuid[];
    _limit      INTEGER := LEAST(GREATEST(COALESCE(p_row_limit, 50), 1), 200);

    _has_batches BOOLEAN := to_regclass('public.batches')       IS NOT NULL;
    _has_checks  BOOLEAN := to_regclass('public.checks')         IS NOT NULL;
    _has_matches BOOLEAN := to_regclass('public.matches')        IS NOT NULL;
    _has_ledger  BOOLEAN := to_regclass('public.usage_ledger')   IS NOT NULL;
    _has_exports BOOLEAN := to_regclass('public.export_history') IS NOT NULL;

    _batches   JSONB := jsonb_build_object('total', 0, 'complete', 0, 'open', 0,
                                           'abandoned', 0, 'approved', 0);
    _volume    JSONB := jsonb_build_object('checks_total', 0, 'matches_total', 0,
                                           'matched', 0, 'approved', 0,
                                           'rejected', 0, 'needs_attention', 0);
    _checks_part  JSONB := '{}'::jsonb;
    _matches_part JSONB := '{}'::jsonb;
    _processed BIGINT := 0;
    _exports   JSONB := jsonb_build_object('total', 0, 'by_format', '{}'::jsonb);
    _companies JSONB := '[]'::jsonb;
    _rows      JSONB := '[]'::jsonb;
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
        RAISE EXCEPTION 'report_summary: p_from and p_to are required and p_to must not precede p_from';
    END IF;

    -- SECURITY INVOKER, so RLS already scopes every read below. This is the
    -- second gate: a caller may only ask about their own tenant. The API's
    -- requireCapability(reports.view) is the first.
    _is_service := _claims IS NULL OR _claims = ''
                OR COALESCE(_claims::jsonb ->> 'role' = 'service_role', FALSE);
    IF NOT _is_service AND p_tenant_id IS DISTINCT FROM public.user_tenant_id() THEN
        RAISE EXCEPTION 'report_summary: tenant mismatch'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF _has_batches THEN
        SELECT COALESCE(array_agg(b.id), '{}'::uuid[])
          INTO _ids
          FROM public.batches b
         WHERE b.tenant_id    = p_tenant_id
           AND b.period_start <= p_to
           AND b.period_end   >= p_from
           AND (p_realm_id IS NULL OR b.realm_id = p_realm_id)
           AND (p_account  IS NULL OR b.account_id = p_account OR b.account_name = p_account)
           AND (p_batch_id IS NULL OR b.id = p_batch_id);

        SELECT jsonb_build_object(
                   'total',     count(*),
                   'complete',  count(*) FILTER (WHERE status = 'complete'),
                   'open',      count(*) FILTER (WHERE status = 'open'),
                   'abandoned', count(*) FILTER (WHERE status = 'abandoned'),
                   'approved',  count(*) FILTER (WHERE approved_at IS NOT NULL))
          INTO _batches
          FROM public.batches
         WHERE id = ANY(_ids);

        SELECT COALESCE(jsonb_agg(t.item ORDER BY t.n DESC), '[]'::jsonb)
          INTO _companies
          FROM (
              SELECT jsonb_build_object(
                         'realm_id',     realm_id,
                         'company_name', max(company_name),
                         'batches',      count(*)) AS item,
                     count(*) AS n
                FROM public.batches
               WHERE id = ANY(_ids)
               GROUP BY realm_id
               LIMIT 100
          ) t;

        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_at DESC), '[]'::jsonb)
          INTO _rows
          FROM (
              SELECT b.id, b.realm_id, b.company_name, b.account_id, b.account_name,
                     b.period_label, b.period_start, b.period_end, b.status,
                     b.approved_by, b.approved_at, b.completed_at,
                     -- public.batch_counts() ships with batches in migration
                     -- 032, so the _has_batches guard covers it too. Reused
                     -- rather than re-counted, so a row in this report and the
                     -- same row in History cannot disagree.
                     public.batch_counts(b.id) AS counts,
                     COALESCE(b.completed_at, b.updated_at) AS sort_at
                FROM public.batches b
               WHERE b.id = ANY(_ids)
               ORDER BY COALESCE(b.completed_at, b.updated_at) DESC
               LIMIT _limit
          ) t;
    END IF;

    -- checks and matches are counted in separate guarded branches, and each
    -- MERGES into _volume rather than replacing it, so a database that has one
    -- table and not the other still returns the figures it can actually count.
    IF _has_checks AND array_length(_ids, 1) IS NOT NULL THEN
        SELECT jsonb_build_object('checks_total', count(*))
          INTO _checks_part
          FROM public.checks c
         WHERE c.batch_id = ANY(_ids);
        _volume := _volume || _checks_part;
    END IF;

    IF _has_matches AND array_length(_ids, 1) IS NOT NULL THEN
        SELECT jsonb_build_object(
                   'matches_total',   count(*),
                   'matched',         count(*) FILTER (WHERE status = 'matched'),
                   'approved',        count(*) FILTER (WHERE status = 'approved'),
                   'rejected',        count(*) FILTER (WHERE status = 'rejected'),
                   -- The same set as NEEDS_ATTENTION_STATUSES / batch_counts().
                   'needs_attention', count(*) FILTER (
                       WHERE status IN ('pending', 'flagged', 'discrepancy', 'unmatched')))
          INTO _matches_part
          FROM public.matches m
         WHERE m.batch_id = ANY(_ids);
        _volume := _volume || _matches_part;
    END IF;

    IF _has_ledger THEN
        SELECT count(*) INTO _processed
          FROM public.usage_ledger l
         WHERE l.tenant_id   = p_tenant_id
           AND l.occurred_at >= p_from::timestamptz
           AND l.occurred_at <  (p_to + 1)::timestamptz
           AND (p_realm_id IS NULL OR l.realm_id = p_realm_id);
    END IF;

    IF _has_exports THEN
        SELECT jsonb_build_object(
                   'total', count(*),
                   'by_format', COALESCE(
                       (SELECT jsonb_object_agg(f, n) FROM (
                            SELECT export_format AS f, count(*) AS n
                              FROM public.export_history
                             WHERE tenant_id = p_tenant_id
                               AND created_at >= p_from::timestamptz
                               AND created_at <  (p_to + 1)::timestamptz
                             GROUP BY export_format) g),
                       '{}'::jsonb))
          INTO _exports
          FROM public.export_history
         WHERE tenant_id  = p_tenant_id
           AND created_at >= p_from::timestamptz
           AND created_at <  (p_to + 1)::timestamptz;
    END IF;

    RETURN jsonb_build_object(
        'range',   jsonb_build_object('from', p_from, 'to', p_to),
        'filters', jsonb_build_object('realm_id', p_realm_id, 'account', p_account,
                                      'batch_id', p_batch_id),
        -- Which figures are real. A missing table is reported, never zeroed.
        'sources', jsonb_build_object(
                       'batches', _has_batches, 'checks', _has_checks,
                       'matches', _has_matches, 'usage_ledger', _has_ledger,
                       'export_history', _has_exports),
        'batches',   _batches,
        'volume',    _volume,
        'cheques_processed', jsonb_build_object(
            'count',  _processed,
            'source', 'usage_ledger.occurred_at',
            -- usage_ledger has realm_id but no account, so the account filter
            -- cannot narrow this figure. Saying so beats a wrong number.
            'account_filter_applied', FALSE),
        'exports', _exports || jsonb_build_object(
            'scope', 'tenant and date range only — export_history has no batch link'),
        'companies', _companies,
        'rows',      _rows,
        'row_limit', _limit);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.report_summary(UUID, DATE, DATE, TEXT, TEXT, UUID, INTEGER)
    TO authenticated;


-- ============================================================================
-- Verification (read-only; run by hand after applying)
--
--   SELECT public.upload_retention_days();                      -- 14
--   SELECT count(*) FROM public.upload_retention;               -- scheduled
--   SELECT * FROM public.upload_retention_due(10);              -- service role
--   SELECT public.report_summary(
--            (SELECT id FROM public.tenants LIMIT 1),
--            date_trunc('month', now())::date,
--            (date_trunc('month', now()) + interval '1 month - 1 day')::date);
-- ============================================================================
