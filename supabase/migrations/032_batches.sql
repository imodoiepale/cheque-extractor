-- ============================================================================
-- Migration 032: batches — one reconciliation run
--
-- A batch is a company (QB realm) + a bank account + a period + a position in
-- the four-step flow Upload -> Match -> Review -> Approve. It is what the
-- stepper, the Continue Reconciliation card and the History page read their
-- state from. Michael's mock is the spec for what one row must be able to
-- render:
--
--   "ABC Construction LLC · Operating Checking / August 2026
--    / Step 3 of 4 — 24 checks need attention."
--
-- DESIGN NOTE — why there is no `current_step` column
-- ---------------------------------------------------
-- CHECKLIST section 3: "Step state comes from the batch record, not from which
-- page is open. Forward steps stay locked until the prior one is genuinely
-- complete."  A settable integer is exactly what the v17 prototype got wrong:
-- Approve was reachable from Upload because the step was a link, not a fact.
-- So this table stores *facts* (which jobs belong to the batch, which cheques
-- came out of them, which matches are resolved, who approved) and the step is
-- DERIVED from them by public.batch_counts() + the gating rule. The only
-- mutable position marker is `status`, and a trigger refuses to move it to
-- 'complete' while the derived preconditions are unmet — so a crafted request
-- straight at PostgREST, even with the service key (which bypasses RLS but not
-- triggers), cannot jump the flow either.
--
-- Idempotent: safe to re-run, and safe to run on a database where migrations
-- 026-031 were never applied (nothing here depends on their tables).
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- 0. Prerequisites that earlier migrations may not have applied
--    public.user_tenant_id() is declared in 008 and re-declared in 030; 030 has
--    never been applied anywhere, so create it defensively against the live
--    profile table (user_profiles — `profiles` does not exist live).
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
            RAISE EXCEPTION '032: no user_profiles/profiles table — cannot build tenant RLS';
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

-- update_updated_at() comes from 013; create it if this database predates that.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ──────────────────────────────────────────────────────────────────────────────
-- 1. The table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batches (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Every write carries tenant_id. NOT NULL, FK, and the RLS WITH CHECK
    -- below all have to agree before a row lands.
    tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Company: the QuickBooks realm. Not an FK to qb_connections, because
    -- disconnecting a company must not delete its reconciliation history.
    -- company_name is a display snapshot, so History still reads correctly
    -- after a rename or a disconnect.
    realm_id        TEXT        NOT NULL,
    company_name    TEXT,

    -- Account: "Operating Checking". account_id is the QB account id when one
    -- is known; today AccountSwitcher only has names (CHECKLIST 4), so the
    -- name is the part that is always present.
    account_id      TEXT,
    account_name    TEXT,

    -- Period: a closed date range. period_label is the rendered form
    -- ("August 2026"); it is a column rather than a generated one because
    -- to_char() is STABLE, not IMMUTABLE, and so cannot back a stored
    -- generated column.
    period_start    DATE        NOT NULL,
    period_end      DATE        NOT NULL,
    period_label    TEXT,

    -- The only mutable position marker. 'open' is resumable; 'complete' is
    -- gated by the trigger below; 'abandoned' is the user discarding a run.
    status          TEXT        NOT NULL DEFAULT 'open',

    -- Approval provenance, for History's approver column.
    approved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,

    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- Constraints added separately so a re-run on an existing table still applies
-- them (CREATE TABLE IF NOT EXISTS is a no-op once the table is there).
ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE public.batches ADD CONSTRAINT batches_status_check
    CHECK (status IN ('open', 'complete', 'abandoned'));

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_period_order;
ALTER TABLE public.batches ADD CONSTRAINT batches_period_order
    CHECK (period_end >= period_start);

CREATE INDEX IF NOT EXISTS idx_batches_tenant_status
    ON public.batches(tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_tenant_realm
    ON public.batches(tenant_id, realm_id);
CREATE INDEX IF NOT EXISTS idx_batches_created_by
    ON public.batches(created_by);

-- One open run per company+account+period, so "create or open" is idempotent
-- and the Continue card can never be ambiguous. Completed and abandoned runs
-- are unconstrained, so a period can be reconciled again later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_one_open_per_scope
    ON public.batches(tenant_id, realm_id, COALESCE(account_id, account_name, ''),
                      period_start, period_end)
    WHERE status = 'open';

DROP TRIGGER IF EXISTS batches_updated_at ON public.batches;
CREATE TRIGGER batches_updated_at
    BEFORE UPDATE ON public.batches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. The link: jobs -> batch, and the two derived tables that follow from it
--
--    Direction: batch_id lives on check_jobs (many jobs to one batch), not an
--    array of job ids on batches. A reconciliation run takes several PDFs, a
--    PDF belongs to exactly one run, and the write happens when the job is
--    created — one column on the child is the normalised form and keeps the
--    insert a single statement.
--
--    checks.batch_id and matches.batch_id are denormalised copies so the step
--    counts are one indexed scan instead of a three-table join. They are kept
--    correct by the triggers below plus the backend stamp after flatten;
--    checks.job_id is not relied on because the live checks table does not
--    have it (see migration 020, which dropped it from the insert list).
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'check_jobs') THEN
        ALTER TABLE public.check_jobs
            ADD COLUMN IF NOT EXISTS batch_id UUID
            REFERENCES public.batches(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_check_jobs_batch ON public.check_jobs(batch_id);
    ELSE
        RAISE WARNING '032: check_jobs missing — jobs cannot be attached to batches';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'checks') THEN
        ALTER TABLE public.checks
            ADD COLUMN IF NOT EXISTS batch_id UUID
            REFERENCES public.batches(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_checks_batch ON public.checks(batch_id);
    ELSE
        RAISE WARNING '032: checks missing — batch cheque counts will be zero';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'matches') THEN
        ALTER TABLE public.matches
            ADD COLUMN IF NOT EXISTS batch_id UUID
            REFERENCES public.batches(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_matches_batch_status
            ON public.matches(batch_id, status);
    ELSE
        RAISE WARNING '032: matches missing — batch match counts will be zero';
    END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. The facts behind each step
--
--    plpgsql (not SQL) on purpose: a plpgsql body is not resolved against the
--    catalog at CREATE time, so this applies cleanly on a database that is
--    missing `matches` and only fails at call time, with a readable error.
--
--    SECURITY INVOKER: the counts a user reads go through that user's RLS.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_counts(p_batch_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'jobs_total',      (SELECT count(*) FROM public.check_jobs j
                             WHERE j.batch_id = p_batch_id),
        'jobs_complete',   (SELECT count(*) FROM public.check_jobs j
                             WHERE j.batch_id = p_batch_id AND j.status = 'complete'),
        'jobs_failed',     (SELECT count(*) FROM public.check_jobs j
                             WHERE j.batch_id = p_batch_id AND j.status = 'error'),
        'jobs_running',    (SELECT count(*) FROM public.check_jobs j
                             WHERE j.batch_id = p_batch_id
                               AND j.status IN ('pending','detecting','extracting',
                                                'analyzed','ocr','ocr_running')),
        'checks_total',    (SELECT count(*) FROM public.checks c
                             WHERE c.batch_id = p_batch_id),
        'matches_total',   (SELECT count(*) FROM public.matches m
                             WHERE m.batch_id = p_batch_id),
        -- "needs attention" — the number Michael's card renders.
        'needs_attention', (SELECT count(*) FROM public.matches m
                             WHERE m.batch_id = p_batch_id
                               AND m.status IN ('pending','flagged','discrepancy','unmatched')),
        'matched',         (SELECT count(*) FROM public.matches m
                             WHERE m.batch_id = p_batch_id AND m.status = 'matched'),
        'approved',        (SELECT count(*) FROM public.matches m
                             WHERE m.batch_id = p_batch_id AND m.status = 'approved'),
        'rejected',        (SELECT count(*) FROM public.matches m
                             WHERE m.batch_id = p_batch_id AND m.status = 'rejected')
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.batch_counts(UUID) TO authenticated;

-- Counts for a page of batches in one round trip, so the History list is not
-- one RPC per row. Keyed by batch id as text. Bounded at 100 ids.
CREATE OR REPLACE FUNCTION public.batch_counts_many(p_batch_ids UUID[])
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}'::jsonb;
    bid UUID;
BEGIN
    IF p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL THEN
        RETURN result;
    END IF;
    IF array_length(p_batch_ids, 1) > 100 THEN
        RAISE EXCEPTION 'batch_counts_many: at most 100 ids per call';
    END IF;
    FOREACH bid IN ARRAY p_batch_ids LOOP
        result := result || jsonb_build_object(bid::text, public.batch_counts(bid));
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.batch_counts_many(UUID[]) TO authenticated;

-- The step-3 (Review) completion rule, as the database sees it. This is the
-- one piece of the gating rule that must survive a caller with a narrower view
-- of `matches` than of `batches`, so it is SECURITY DEFINER: a user who could
-- see the batch but not its matches would otherwise read needs_attention = 0
-- and look finished.
--
-- Keep in step with deriveBatchSteps() in frontend/lib/batch-state.ts, which is
-- the same rule for the API layer.
CREATE OR REPLACE FUNCTION public.batch_can_complete(p_batch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    n_checks  BIGINT;
    n_matches BIGINT;
    n_open    BIGINT;
BEGIN
    SELECT count(*) INTO n_checks  FROM public.checks  c WHERE c.batch_id = p_batch_id;
    SELECT count(*) INTO n_matches FROM public.matches m WHERE m.batch_id = p_batch_id;
    SELECT count(*) INTO n_open    FROM public.matches m
     WHERE m.batch_id = p_batch_id
       AND m.status IN ('pending','flagged','discrepancy','unmatched');

    RETURN n_checks > 0 AND n_matches >= n_checks AND n_open = 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.batch_can_complete(UUID) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. The server-side lock on a forward jump
--
--    Completing a batch is the only irreversible step, so it is the one the
--    database refuses outright when the facts do not support it. An API bug, a
--    hand-rolled PostgREST call, or a service-key script all hit this.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_batch_transition()
RETURNS TRIGGER AS $$
DECLARE
    -- OLD is unassigned on INSERT, so it is read exactly once, under TG_OP.
    was_complete BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'batches.tenant_id is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        was_complete := (OLD.status = 'complete');
        -- A completed run is history: reopening it would un-approve writes
        -- already pushed to QuickBooks.
        IF was_complete AND NEW.status <> 'complete' THEN
            RAISE EXCEPTION 'batch % is complete and cannot be reopened', OLD.id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status = 'complete' AND NOT was_complete THEN
        IF NOT public.batch_can_complete(NEW.id) THEN
            RAISE EXCEPTION
                'batch % cannot be approved: step 3 (Review) is not complete — every cheque needs a resolved match first'
                , NEW.id
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.approved_by  := COALESCE(NEW.approved_by, auth.uid());
        NEW.approved_at  := COALESCE(NEW.approved_at, NOW());
        NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS batches_guard_transition ON public.batches;
CREATE TRIGGER batches_guard_transition
    BEFORE INSERT OR UPDATE ON public.batches
    FOR EACH ROW EXECUTE FUNCTION public.guard_batch_transition();


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Keeping the denormalised batch_id correct without touching the match
--    engine or migration 020's flatten function
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'matches'
                     AND column_name = 'batch_id') THEN
        RAISE WARNING '032: matches.batch_id absent — skipping batch stamp triggers';
        RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.stamp_match_batch()
    RETURNS TRIGGER AS $f$
    BEGIN
        IF NEW.batch_id IS NULL AND NEW.check_id IS NOT NULL THEN
            SELECT c.batch_id INTO NEW.batch_id
            FROM public.checks c WHERE c.id = NEW.check_id;
        END IF;
        RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

    DROP TRIGGER IF EXISTS matches_stamp_batch ON public.matches;
    CREATE TRIGGER matches_stamp_batch
        BEFORE INSERT OR UPDATE OF check_id ON public.matches
        FOR EACH ROW EXECUTE FUNCTION public.stamp_match_batch();

    -- The reverse order also happens: matching can run before the backend has
    -- stamped the cheques. When a cheque is attached, carry it to its match.
    CREATE OR REPLACE FUNCTION public.backfill_match_batch()
    RETURNS TRIGGER AS $f$
    BEGIN
        UPDATE public.matches SET batch_id = NEW.batch_id WHERE check_id = NEW.id;
        RETURN NULL;
    END;
    $f$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

    DROP TRIGGER IF EXISTS checks_backfill_match_batch ON public.checks;
    CREATE TRIGGER checks_backfill_match_batch
        AFTER UPDATE OF batch_id ON public.checks
        FOR EACH ROW WHEN (NEW.batch_id IS DISTINCT FROM OLD.batch_id)
        EXECUTE FUNCTION public.backfill_match_batch();
END $$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RLS. An anon-key request must return zero rows: user_tenant_id() is NULL
--    without a session, and `tenant_id = NULL` is never true.
--    There is deliberately no DELETE policy — batches are history. The
--    tenants FK cascade still works, because FK actions run as the table owner.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation batches select" ON public.batches;
CREATE POLICY "Tenant isolation batches select"
    ON public.batches FOR SELECT
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation batches insert" ON public.batches;
CREATE POLICY "Tenant isolation batches insert"
    ON public.batches FOR INSERT
    WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation batches update" ON public.batches;
CREATE POLICY "Tenant isolation batches update"
    ON public.batches FOR UPDATE
    USING (tenant_id = public.user_tenant_id())
    WITH CHECK (tenant_id = public.user_tenant_id());

GRANT SELECT, INSERT, UPDATE ON public.batches TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Documentation that travels with the schema
-- ──────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.batches IS
    'One reconciliation run: company (realm) + bank account + period + position in Upload/Match/Review/Approve. Step state is DERIVED (see public.batch_counts and frontend/lib/batch-state.ts); there is no settable step column. public.batch_can_complete gates the move to status=complete.';
COMMENT ON COLUMN public.batches.status IS
    'open | complete | abandoned. The move to complete is refused by trigger batches_guard_transition unless public.batch_can_complete() holds.';
COMMENT ON COLUMN public.check_jobs.batch_id IS
    'The reconciliation run this PDF belongs to. Many jobs to one batch.';
