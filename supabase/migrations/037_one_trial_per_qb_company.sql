-- ============================================================================
-- 037: One free trial per QuickBooks company (CHECKLIST section 6)
--
-- Michael's question: what stops someone taking a second free trial with a new
-- email address? Nothing, while identity is the email. The firm's QuickBooks
-- realm id is the stable identity — the same books cannot be two firms — so a
-- realm gets exactly one trial, claimed the first time it is connected.
--
-- Three pieces, deliberately small:
--
--   1. qb_realm_trials   — realm_id is the PRIMARY KEY. That single constraint
--                          IS the rule; nothing has to remember to check first.
--   2. tenants.trial_blocked_* — why a tenant's trial is void, so the existing
--                          resolver can report it instead of a second code path.
--   3. claim_realm_trial() — service-role only. Called once, at the moment a
--                          QuickBooks company is connected.
--
-- tenant_usage_state() (migration 029) is REPLACED rather than wrapped, so the
-- meter the UI draws and the gate that blocks work stay the same single answer.
-- Nothing here touches history: a blocked trial still reads every past job.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. The claim table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qb_realm_trials (
    -- Intuit's realm id, the natural key. PRIMARY KEY, not UNIQUE-on-a-surrogate:
    -- the uniqueness is the whole point of the table.
    realm_id     TEXT PRIMARY KEY,

    -- The tenant that got the trial for this company. ON DELETE RESTRICT: if the
    -- row vanished with the tenant, deleting the firm would hand out a fresh
    -- trial for the same books, which is exactly the loophole being closed.
    tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

    company_name TEXT,
    claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_realm_trials_tenant
    ON public.qb_realm_trials (tenant_id);

ALTER TABLE public.qb_realm_trials ENABLE ROW LEVEL SECURITY;

-- A tenant may see its own claim (so Settings can say "this company's trial was
-- used on <date>"). It may never see another firm's, and may never write: a
-- tenant that could delete its claim row could re-trial at will.
DROP POLICY IF EXISTS "Users can view own tenant qb_realm_trials" ON public.qb_realm_trials;
CREATE POLICY "Users can view own tenant qb_realm_trials"
    ON public.qb_realm_trials FOR SELECT
    TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to qb_realm_trials" ON public.qb_realm_trials;
CREATE POLICY "Service role full access to qb_realm_trials"
    ON public.qb_realm_trials FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qb_realm_trials FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qb_realm_trials FROM anon;
GRANT SELECT ON public.qb_realm_trials TO authenticated;

-- Backfill: every company already connected has already had its trial. Taken
-- from qb_connections, oldest connection per realm wins, because that is the
-- tenant whose trial actually ran. ON CONFLICT DO NOTHING makes the re-run a
-- no-op rather than a reassignment.
INSERT INTO public.qb_realm_trials (realm_id, tenant_id, company_name, claimed_at)
SELECT DISTINCT ON (c.realm_id)
       c.realm_id, c.tenant_id, c.company_name,
       COALESCE(c.connected_at, now())
  FROM public.qb_connections c
 WHERE c.realm_id IS NOT NULL
   AND c.tenant_id IS NOT NULL
 ORDER BY c.realm_id, COALESCE(c.connected_at, now()) ASC
ON CONFLICT (realm_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Why a tenant's trial is void
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_blocked_reason   TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_blocked_realm_id TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_blocked_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.tenants.trial_blocked_reason IS
    'Non-NULL means this tenant is not entitled to a trial. Currently only realm_trial_already_used (migration 037). Read by tenant_usage_state(); has no effect once subscription_status = active or a comp grant is live.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. claim_realm_trial() — called when a QuickBooks company is connected
--
-- First claim wins. A second tenant connecting the same realm is not blocked
-- from CONNECTING (they may well be a paying firm, or the same firm migrating);
-- it is blocked from a free trial, and only while it is actually trialing.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_realm_trial(
    p_tenant_id    UUID,
    p_realm_id     TEXT,
    p_company_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    _owner      UUID;
    _claimed_at TIMESTAMPTZ;
    _status     TEXT;
    _blocked    BOOLEAN := FALSE;
BEGIN
    IF p_tenant_id IS NULL OR p_realm_id IS NULL OR btrim(p_realm_id) = '' THEN
        RAISE EXCEPTION 'claim_realm_trial: tenant_id and realm_id are required';
    END IF;

    INSERT INTO public.qb_realm_trials (realm_id, tenant_id, company_name)
    VALUES (btrim(p_realm_id), p_tenant_id, p_company_name)
    ON CONFLICT (realm_id) DO NOTHING;

    SELECT tenant_id, claimed_at INTO _owner, _claimed_at
      FROM public.qb_realm_trials
     WHERE realm_id = btrim(p_realm_id);

    -- This tenant owns the claim (either just now, or from an earlier connect).
    IF _owner = p_tenant_id THEN
        RETURN jsonb_build_object(
            'claimed', TRUE, 'trial_blocked', FALSE,
            'realm_id', btrim(p_realm_id),
            'owner_tenant_id', _owner, 'claimed_at', _claimed_at
        );
    END IF;

    -- Another tenant already used this company's trial.
    SELECT subscription_status INTO _status FROM public.tenants WHERE id = p_tenant_id;

    IF COALESCE(_status, 'trialing') = 'trialing' THEN
        UPDATE public.tenants
           SET trial_blocked_reason   = 'realm_trial_already_used',
               trial_blocked_realm_id = btrim(p_realm_id),
               trial_blocked_at       = now()
         WHERE id = p_tenant_id
           AND trial_blocked_reason IS NULL;   -- first block stands; keeps the audit honest
        _blocked := TRUE;
    END IF;

    INSERT INTO public.audit_logs (tenant_id, user_id, action, new_value, metadata)
    VALUES (
        p_tenant_id, NULL, 'trial.realm_already_used', NULL,
        jsonb_build_object(
            'realm_id', btrim(p_realm_id),
            'owner_tenant_id', _owner,
            'owner_claimed_at', _claimed_at,
            'subscription_status', _status,
            'trial_blocked', _blocked
        )
    );

    RETURN jsonb_build_object(
        'claimed', FALSE, 'trial_blocked', _blocked,
        'realm_id', btrim(p_realm_id),
        'owner_tenant_id', _owner, 'claimed_at', _claimed_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Service role only. A tenant session that could call this could claim a realm
-- it has not connected, locking a competitor out of their own trial.
REVOKE ALL ON FUNCTION public.claim_realm_trial(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_realm_trial(UUID, TEXT, TEXT) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_realm_trial(UUID, TEXT, TEXT) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. tenant_usage_state(), replaced so the blocked trial is reported by the one
--    resolver the meter and both write paths already read.
--
--    Identical to migration 029 except for the two marked lines in the trialing
--    branch and the two extra keys in the returned object.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_usage_state(
    p_tenant_id UUID,
    p_at        TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB AS $$
DECLARE
    _claims     TEXT := current_setting('request.jwt.claims', TRUE);
    _is_service BOOLEAN;
    _t          public.tenants;
    _comp       public.comp_grants;
    _is_comped  BOOLEAN := FALSE;
    _p_start    DATE;
    _p_end      DATE;
    _used_period  INTEGER := 0;
    _used_trial   INTEGER := 0;
    _used_comp    INTEGER := 0;
    _days_left    INTEGER;
    _checks_left  INTEGER;
    _allowed      BOOLEAN;
    _reason       TEXT := NULL;
    _allowance    INTEGER;
BEGIN
    _is_service := _claims IS NULL
                OR _claims = ''
                OR COALESCE(_claims::jsonb ->> 'role' = 'service_role', FALSE);

    IF NOT _is_service AND p_tenant_id IS DISTINCT FROM public.user_tenant_id() THEN
        RAISE EXCEPTION 'tenant_usage_state: not permitted for another tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO _t FROM public.tenants WHERE id = p_tenant_id;
    IF _t.id IS NULL THEN
        RETURN jsonb_build_object(
            'tenant_id', p_tenant_id,
            'processing_allowed', FALSE,
            'block_reason', 'unknown_tenant'
        );
    END IF;

    SELECT period_start, period_end INTO _p_start, _p_end
      FROM public.current_billing_period(p_tenant_id, p_at);

    SELECT COALESCE(SUM(quantity), 0) INTO _used_period
      FROM public.usage_ledger
     WHERE tenant_id = p_tenant_id
       AND billing_period_start = _p_start;

    SELECT COALESCE(SUM(quantity), 0) INTO _used_trial
      FROM public.usage_ledger
     WHERE tenant_id = p_tenant_id
       AND occurred_at >= COALESCE(_t.trial_started_at, _t.created_at, p_at);

    SELECT * INTO _comp
      FROM public.comp_grants
     WHERE tenant_id = p_tenant_id
       AND revoked_at IS NULL
       AND starts_at <= p_at
       AND expires_at > p_at
     ORDER BY expires_at DESC
     LIMIT 1;

    _is_comped := _comp.id IS NOT NULL;

    IF _is_comped THEN
        SELECT COALESCE(SUM(quantity), 0) INTO _used_comp
          FROM public.usage_ledger
         WHERE tenant_id = p_tenant_id
           AND occurred_at >= _comp.starts_at;
    END IF;

    _allowance := _t.plan_check_allowance;

    IF _is_comped THEN
        _days_left   := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_comp.expires_at - p_at)) / 86400.0))::int;
        _checks_left := CASE WHEN _comp.check_limit IS NULL
                            THEN NULL
                            ELSE GREATEST(0, _comp.check_limit - _used_comp) END;
        _allowed := _comp.check_limit IS NULL OR _used_comp < _comp.check_limit;
        IF NOT _allowed THEN _reason := 'comp_check_limit_reached'; END IF;

    ELSIF _t.subscription_status = 'active' THEN
        _days_left   := NULL;
        _checks_left := CASE WHEN _allowance IS NULL
                            THEN NULL
                            ELSE GREATEST(0, _allowance - _used_period) END;
        _allowed := TRUE;

    ELSIF _t.subscription_status IN ('past_due', 'canceled', 'expired') THEN
        _days_left   := 0;
        _checks_left := 0;
        _allowed     := FALSE;
        _reason      := 'subscription_' || _t.subscription_status;

    -- ── 037: this QuickBooks company already had its one trial. ──────────────
    ELSIF _t.trial_blocked_reason IS NOT NULL THEN
        _days_left   := 0;
        _checks_left := 0;
        _allowed     := FALSE;
        _reason      := _t.trial_blocked_reason;

    ELSE
        -- Trialing. 14 days OR 250 cheques, whichever comes first.
        _days_left   := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_t.trial_ends_at - p_at)) / 86400.0))::int;
        _checks_left := GREATEST(0, COALESCE(_t.trial_check_limit, 250) - _used_trial);
        IF _t.trial_ends_at <= p_at THEN
            _allowed := FALSE;
            _reason  := 'trial_expired';
        ELSIF _used_trial >= COALESCE(_t.trial_check_limit, 250) THEN
            _allowed := FALSE;
            _reason  := 'trial_check_limit_reached';
        ELSE
            _allowed := TRUE;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id',               p_tenant_id,
        'plan',                    _t.plan,
        'subscription_status',     _t.subscription_status,
        'as_of',                   p_at,

        'trial_started_at',        _t.trial_started_at,
        'trial_ends_at',           _t.trial_ends_at,
        'trial_check_limit',       COALESCE(_t.trial_check_limit, 250),
        'trial_checks_used',       _used_trial,
        'trial_blocked_reason',    _t.trial_blocked_reason,
        'trial_blocked_realm_id',  _t.trial_blocked_realm_id,

        'days_remaining',          _days_left,
        'checks_remaining',        _checks_left,

        'billing_period_start',    _p_start,
        'billing_period_end',      _p_end,
        'checks_used_this_period', _used_period,
        'plan_check_allowance',    _allowance,

        'is_comped',               _is_comped,
        'comp_expires_at',         _comp.expires_at,
        'comp_reason',             _comp.reason,
        'comp_check_limit',        _comp.check_limit,
        'comp_checks_used',        CASE WHEN _is_comped THEN _used_comp ELSE NULL END,

        'processing_allowed',      _allowed,
        'block_reason',            _reason
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.tenant_usage_state(UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON TABLE public.qb_realm_trials IS
    'One free trial per QuickBooks company. realm_id is the PRIMARY KEY, so the first tenant to connect a company claims its trial and a second signup with a new email address cannot get another. Written only by claim_realm_trial() under the service key.';
COMMENT ON FUNCTION public.claim_realm_trial(UUID, TEXT, TEXT) IS
    'Called when a QuickBooks company is connected. Claims the realm''s one trial for this tenant, or — if another tenant already holds it and this tenant is still trialing — sets tenants.trial_blocked_reason and writes an audit_logs row. Never blocks the connection itself.';
