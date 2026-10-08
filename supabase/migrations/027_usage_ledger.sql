-- ============================================================================
-- 027: The immutable usage ledger (CHECKLIST section 8)
--
-- One row per SUCCESSFULLY processed cheque. This table is the billing source
-- of truth, so it is append-only and the append is idempotent.
--
--   * Count on success only      — nothing inserts a row for a failed engine run.
--   * Several cheques on a page  — one row each; page_number is recorded, never
--                                  aggregated.
--   * Detected cheques, not pages — a 40-page statement with 6 cheques makes 6
--                                  rows, because the writer iterates detected
--                                  cheques.
--   * Idempotency                — UNIQUE (tenant_id, idempotency_key). An
--                                  automatic retry hits the constraint, not an
--                                  application-level "have I seen this" check.
--   * Repeat uploads count again — a new job_id produces a new idempotency key,
--                                  so the row is written. The warning before
--                                  that happens is upload_fingerprints (028).
--   * Immutable                  — a BEFORE UPDATE OR DELETE trigger raises,
--                                  and UPDATE/DELETE are revoked from anon and
--                                  authenticated. Belt and braces, because
--                                  either one alone has been bypassed before.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.usage_ledger (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who is billed. ON DELETE RESTRICT, not CASCADE: a billing ledger that
    -- disappears with the tenant cannot be reconciled against Stripe after a
    -- dispute. Deleting a tenant now requires an explicit archival decision.
    tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

    -- Who caused it, and which QuickBooks company it belongs to.
    user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    realm_id             TEXT,

    -- What was processed. check_jobs.job_id and checks.check_id are both TEXT
    -- in 001_schema.sql; no FK on check_id because checks rows are rewritten by
    -- flatten_checks_from_job() and the ledger must outlive that.
    job_id               TEXT REFERENCES public.check_jobs(job_id) ON DELETE SET NULL,
    check_id             TEXT NOT NULL,
    page_number          INTEGER,

    -- The processing event.
    event_type           TEXT NOT NULL DEFAULT 'check_processed'
        CHECK (event_type IN ('check_processed')),
    idempotency_key      TEXT NOT NULL,
    quantity             INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    engines              TEXT[],
    occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Billing period, resolved at write time by current_billing_period().
    billing_period_start DATE NOT NULL,
    billing_period_end   DATE NOT NULL,

    -- TRUE when the tenant was warned the file was uploaded before and chose to
    -- process and be counted anyway (CHECKLIST section 8, Michael 30 Sept).
    is_reupload          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Stripe reference. Nullable: metered-event submission is section 7 work.
    -- Write-once, enforced by the immutability trigger below.
    stripe_event_id      TEXT,
    stripe_reported_at   TIMESTAMPTZ,

    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── The idempotency guarantee ────────────────────────────────────────────────
-- This index IS the no-double-count rule. Scoped by tenant so two firms cannot
-- collide on a key, and so a key is never a cross-tenant oracle.
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_idempotency_key_uniq
    ON public.usage_ledger (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_tenant_occurred
    ON public.usage_ledger (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_tenant_period
    ON public.usage_ledger (tenant_id, billing_period_start);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_job
    ON public.usage_ledger (job_id);
-- Partial index for the Stripe reporter: "rows not yet reported".
CREATE INDEX IF NOT EXISTS idx_usage_ledger_unreported
    ON public.usage_ledger (tenant_id, occurred_at)
    WHERE stripe_event_id IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Immutability
--
-- The service role is allowed exactly one mutation: stamping stripe_event_id /
-- stripe_reported_at once, so section 7 can reconcile without a second table.
-- Everything else raises, including every DELETE from every role.
--
-- The service-role test is inlined rather than calling public.is_service_request()
-- (migration 030) so this migration does not depend on one numbered after it.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.usage_ledger_append_only()
RETURNS TRIGGER AS $$
DECLARE
    _claims TEXT := current_setting('request.jwt.claims', TRUE);
    _is_service BOOLEAN;
BEGIN
    -- No JWT at all means psql / a migration / the service key without claims.
    _is_service := _claims IS NULL
                OR _claims = ''
                OR COALESCE(_claims::jsonb ->> 'role' = 'service_role', FALSE);

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'usage_ledger is append-only: DELETE is not permitted (id %)', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NOT _is_service THEN
        RAISE EXCEPTION
            'usage_ledger is append-only: UPDATE is not permitted'
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- Service role: only the two Stripe columns may differ.
    IF (to_jsonb(NEW) - 'stripe_event_id' - 'stripe_reported_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'stripe_event_id' - 'stripe_reported_at') THEN
        RAISE EXCEPTION
            'usage_ledger is append-only: only stripe_event_id and stripe_reported_at may be updated'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.stripe_event_id IS NOT NULL
       AND NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id THEN
        RAISE EXCEPTION
            'usage_ledger.stripe_event_id is write-once (id %)', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_usage_ledger_append_only ON public.usage_ledger;
CREATE TRIGGER trg_usage_ledger_append_only
    BEFORE UPDATE OR DELETE ON public.usage_ledger
    FOR EACH ROW EXECUTE FUNCTION public.usage_ledger_append_only();

-- Second, independent lock: the grant. Even if the trigger were dropped, a
-- tenant session has no UPDATE or DELETE privilege to use.
REVOKE UPDATE, DELETE, TRUNCATE ON public.usage_ledger FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.usage_ledger FROM anon;
REVOKE INSERT ON public.usage_ledger FROM authenticated;
REVOKE INSERT ON public.usage_ledger FROM anon;
GRANT SELECT ON public.usage_ledger TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS: a tenant member reads their own firm's rows and nothing else.
-- There is deliberately no INSERT/UPDATE/DELETE policy for `authenticated`;
-- writes come from the backend pipeline under the service key.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant usage_ledger" ON public.usage_ledger;
CREATE POLICY "Users can view own tenant usage_ledger"
    ON public.usage_ledger FOR SELECT
    TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to usage_ledger" ON public.usage_ledger;
CREATE POLICY "Service role full access to usage_ledger"
    ON public.usage_ledger FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- The one writer.
--
-- SECURITY DEFINER so the backend can call it as an RPC, and so the billing
-- period is computed inside the same statement as the insert. ON CONFLICT DO
-- NOTHING leans on the unique index: a retry is absorbed by the constraint.
--
-- Returns {recorded, duplicate, ledger_id, billing_period_start/end}. A caller
-- that gets duplicate=true has learnt the retry was already counted; it must
-- not treat that as an error.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_check_processed(
    p_tenant_id       UUID,
    p_check_id        TEXT,
    p_idempotency_key TEXT,
    p_job_id          TEXT    DEFAULT NULL,
    p_user_id         UUID    DEFAULT NULL,
    p_realm_id        TEXT    DEFAULT NULL,
    p_page_number     INTEGER DEFAULT NULL,
    p_engines         TEXT[]  DEFAULT NULL,
    p_is_reupload     BOOLEAN DEFAULT FALSE,
    p_occurred_at     TIMESTAMPTZ DEFAULT now(),
    p_metadata        JSONB   DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    _start DATE;
    _end   DATE;
    _id    UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'record_check_processed: tenant_id is required';
    END IF;
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'record_check_processed: idempotency_key is required';
    END IF;
    IF p_check_id IS NULL OR btrim(p_check_id) = '' THEN
        RAISE EXCEPTION 'record_check_processed: check_id is required';
    END IF;

    SELECT period_start, period_end
      INTO _start, _end
      FROM public.current_billing_period(p_tenant_id, p_occurred_at);

    INSERT INTO public.usage_ledger (
        tenant_id, user_id, realm_id, job_id, check_id, page_number,
        event_type, idempotency_key, quantity, engines, occurred_at,
        billing_period_start, billing_period_end, is_reupload, metadata
    ) VALUES (
        p_tenant_id, p_user_id, p_realm_id, p_job_id, p_check_id, p_page_number,
        'check_processed', p_idempotency_key, 1, p_engines, p_occurred_at,
        _start, _end, COALESCE(p_is_reupload, FALSE), COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO _id;

    IF _id IS NULL THEN
        SELECT id INTO _id
          FROM public.usage_ledger
         WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
        RETURN jsonb_build_object(
            'recorded', FALSE, 'duplicate', TRUE, 'ledger_id', _id,
            'billing_period_start', _start, 'billing_period_end', _end
        );
    END IF;

    RETURN jsonb_build_object(
        'recorded', TRUE, 'duplicate', FALSE, 'ledger_id', _id,
        'billing_period_start', _start, 'billing_period_end', _end
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the backend records usage. `authenticated` must not be able to mint
-- billable events, and must not be able to suppress them either.
REVOKE ALL ON FUNCTION public.record_check_processed(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_check_processed(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, JSONB
) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.record_check_processed(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, JSONB
) TO service_role;

COMMENT ON TABLE public.usage_ledger IS
    'Append-only billing ledger: one row per successfully processed cheque. Immutable by trigger and by revoked privileges. Idempotent on (tenant_id, idempotency_key).';
COMMENT ON COLUMN public.usage_ledger.idempotency_key IS
    'Stable per processing event. Backend format: <job_id>:<check_id>:<attempt-scope>. The UNIQUE index on (tenant_id, idempotency_key) is what prevents double-counting.';
COMMENT ON FUNCTION public.record_check_processed(UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TIMESTAMPTZ, JSONB) IS
    'The only writer of usage_ledger. Service role only. Absorbs retries via ON CONFLICT DO NOTHING on the idempotency index.';
