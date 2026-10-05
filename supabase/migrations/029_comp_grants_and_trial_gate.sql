-- ============================================================================
-- 029: Comp accounts (CHECKLIST section 5) and the server-side trial gate
--      (CHECKLIST sections 1 and 6)
--
-- Trial: 14 days OR 250 successfully processed cheques, whichever comes first.
-- No card. When it ends, PROCESSING stops and HISTORY stays readable — so the
-- gate is a single function the write paths call, and nothing is revoked from
-- the read paths.
--
-- Comp account: a Super Admin grants a free account for a set period, with a
-- reason and an expiry. A live comp grant overrides the trial limits so a pilot
-- firm is never cut off mid-test. Every grant and revocation is written to
-- audit_logs by a trigger, so the log cannot be skipped by a caller that
-- forgets.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. comp_grants
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comp_grants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Who granted it. The email is stored as well as the id because Super Admin
    -- is an email allowlist (frontend/lib/super-admin.ts), not a database role,
    -- and the log has to remain readable if the account is later removed.
    granted_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    granted_by_email TEXT NOT NULL,

    -- Required, and required to be meaningful. "This is how the pilot firms get
    -- in" — a blank reason makes the audit log worthless.
    reason         TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),

    starts_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL,

    -- NULL = unlimited cheques for the comp period. A number caps it.
    check_limit    INTEGER CHECK (check_limit IS NULL OR check_limit > 0),

    revoked_at     TIMESTAMPTZ,
    revoked_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoke_reason  TEXT,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT comp_grants_window_check CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_comp_grants_tenant ON public.comp_grants (tenant_id);
-- "Which grant is live" is resolved by window, not by a partial unique index:
-- the predicate would need now(), which is not immutable, and a lapsed but
-- un-revoked grant would otherwise block ever granting a new one.
-- tenant_usage_state() takes the grant with the latest expires_at.
CREATE INDEX IF NOT EXISTS idx_comp_grants_tenant_window
    ON public.comp_grants (tenant_id, expires_at DESC)
    WHERE revoked_at IS NULL;

-- ── RLS: a tenant may SEE that it is comped (the meter says so) but may not
--    create, extend or revoke a grant. All writes are service-role.
ALTER TABLE public.comp_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant comp_grants" ON public.comp_grants;
CREATE POLICY "Users can view own tenant comp_grants"
    ON public.comp_grants FOR SELECT
    TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to comp_grants" ON public.comp_grants;
CREATE POLICY "Service role full access to comp_grants"
    ON public.comp_grants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comp_grants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.comp_grants FROM anon;
GRANT SELECT ON public.comp_grants TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. "Every override is logged" — enforced by trigger, not by the caller
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_comp_grant_change()
RETURNS TRIGGER AS $$
DECLARE
    _action TEXT;
    _actor  UUID;
    -- Captured before the branch: OLD is unassigned on INSERT, so it must not
    -- be touched inside a CASE whose evaluation order is not guaranteed.
    _old    TEXT := NULL;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        _old := to_jsonb(OLD)::text;
    END IF;

    IF TG_OP = 'INSERT' THEN
        _action := 'comp_account.granted';
        _actor  := NEW.granted_by;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
        _action := 'comp_account.revoked';
        _actor  := NEW.revoked_by;
    ELSE
        _action := 'comp_account.updated';
        _actor  := NEW.granted_by;
    END IF;

    INSERT INTO public.audit_logs (tenant_id, user_id, action, old_value, new_value, metadata)
    VALUES (
        NEW.tenant_id,
        _actor,
        _action,
        _old,
        to_jsonb(NEW)::text,
        jsonb_build_object(
            'comp_grant_id',    NEW.id,
            'granted_by_email', NEW.granted_by_email,
            'reason',           NEW.reason,
            'starts_at',        NEW.starts_at,
            'expires_at',       NEW.expires_at,
            'check_limit',      NEW.check_limit,
            'revoke_reason',    NEW.revoke_reason
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_comp_grants_audit ON public.comp_grants;
CREATE TRIGGER trg_comp_grants_audit
    AFTER INSERT OR UPDATE ON public.comp_grants
    FOR EACH ROW EXECUTE FUNCTION public.log_comp_grant_change();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. tenant_usage_state() — the one answer the UI and both write paths read
--
-- SECURITY DEFINER so it can read tenants and count the ledger, with an
-- explicit caller check: a signed-in user may only ask about their own firm.
-- Without that check a DEFINER function would be a cross-tenant read.
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

    -- Live comp grant: not revoked, and p_at inside its window.
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

    -- ── Resolution order. Comp first, so a pilot firm is never cut off. ──
    IF _is_comped THEN
        _days_left   := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_comp.expires_at - p_at)) / 86400.0))::int;
        _checks_left := CASE WHEN _comp.check_limit IS NULL
                            THEN NULL
                            ELSE GREATEST(0, _comp.check_limit - _used_comp) END;
        _allowed := _comp.check_limit IS NULL OR _used_comp < _comp.check_limit;
        IF NOT _allowed THEN _reason := 'comp_check_limit_reached'; END IF;

    ELSIF _t.subscription_status = 'active' THEN
        -- Paid: overage is billed, not blocked (CHECKLIST section 7).
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

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. processing_allowed() — the gate itself, so a write path is one call
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.processing_allowed(
    p_tenant_id UUID,
    p_at        TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
           (public.tenant_usage_state(p_tenant_id, p_at) ->> 'processing_allowed')::boolean,
           FALSE
         )
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.processing_allowed(UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON TABLE public.comp_grants IS
    'Super Admin comp accounts: free access for a set period, with a mandatory reason and expiry. A live grant overrides the trial limits. Every change is written to audit_logs by trigger.';
COMMENT ON FUNCTION public.tenant_usage_state(UUID, TIMESTAMPTZ) IS
    'Single resolver for trial/comp/subscription state: days remaining, cheques remaining, cheques used this period, processing_allowed, is_comped. Read by the trial meter endpoint and by both write paths.';
COMMENT ON FUNCTION public.processing_allowed(UUID, TIMESTAMPTZ) IS
    'The server-side trial gate. Blocks processing only; nothing here restricts reading history.';
