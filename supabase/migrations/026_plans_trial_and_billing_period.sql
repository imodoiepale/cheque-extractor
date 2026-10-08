-- ============================================================================
-- 026: Real plan names, trial clock, and the billing-period helper
--
-- Three things, all prerequisites for the usage ledger (027) and the trial
-- gate (029):
--
--   1. tenants.plan only allowed ('free','starter','professional',
--      'enterprise','pro') after migration 014. The real plans are
--      Essential / Professional / Scale (CHECKLIST section 7). The constraint
--      is WIDENED, not replaced: every legacy value stays valid so no existing
--      row breaks.
--   2. The trial clock (14 days / 250 successfully processed cheques) needs
--      somewhere to live. It goes on tenants, backfilled from created_at so
--      existing firms are not handed a fresh 14 days.
--   3. One function that answers "which billing period is this tenant in right
--      now", so the ledger, the Stripe reporter and the read endpoint all agree.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Widen tenants.plan
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'plan'
    ) THEN
        ALTER TABLE public.tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
    END IF;
END $$;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_check
    CHECK (plan IN (
        -- current plans (STRIPE-BILLING-REQUIREMENTS.md)
        'essential', 'professional', 'scale',
        -- legacy values already present in live rows; kept so nothing breaks
        'free', 'starter', 'enterprise', 'pro'
    ));

COMMENT ON COLUMN public.tenants.plan IS
    'Plan tier. Current: essential | professional | scale. Legacy values (free, starter, enterprise, pro) remain accepted for rows created before migration 026.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Trial clock + subscription status on tenants
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_started_at   TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_ends_at      TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_check_limit  INTEGER NOT NULL DEFAULT 250;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_days         INTEGER NOT NULL DEFAULT 14;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_check_allowance INTEGER;

-- Backfill: the trial started when the firm was created, not when this
-- migration ran. Running this twice must not extend anybody's trial, hence
-- the IS NULL guards.
UPDATE public.tenants
   SET trial_started_at = COALESCE(created_at, now())
 WHERE trial_started_at IS NULL;

UPDATE public.tenants
   SET trial_ends_at = trial_started_at + (COALESCE(trial_days, 14) || ' days')::interval
 WHERE trial_ends_at IS NULL;

UPDATE public.tenants
   SET subscription_status = 'trialing'
 WHERE subscription_status IS NULL;

ALTER TABLE public.tenants ALTER COLUMN subscription_status SET DEFAULT 'trialing';

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_status_check
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'expired'));

COMMENT ON COLUMN public.tenants.trial_check_limit IS
    '250 successfully processed cheques, per CHECKLIST section 1/6. Counted from usage_ledger, not from check_jobs.';
COMMENT ON COLUMN public.tenants.plan_check_allowance IS
    'Included cheques per billing period once subscribed (Essential 1200, Professional 4500, Scale 10000). NULL while on trial.';

-- New signups get the clock set at insert time rather than relying on a
-- backfill. A trigger, not a column DEFAULT, because trial_ends_at depends on
-- trial_days which the row itself supplies.
CREATE OR REPLACE FUNCTION public.set_tenant_trial_window()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.trial_started_at IS NULL THEN
        NEW.trial_started_at := COALESCE(NEW.created_at, now());
    END IF;
    IF NEW.trial_ends_at IS NULL THEN
        NEW.trial_ends_at := NEW.trial_started_at
                             + (COALESCE(NEW.trial_days, 14) || ' days')::interval;
    END IF;
    IF NEW.subscription_status IS NULL THEN
        NEW.subscription_status := 'trialing';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_tenants_trial_window ON public.tenants;
CREATE TRIGGER trg_tenants_trial_window
    BEFORE INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.set_tenant_trial_window();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Billing period helper
--
--    "Renewal on the same date each month, regardless of when someone
--    subscribed" (CHECKLIST item 17). So the period is a monthly window
--    anchored on the tenant's anchor day, clamped for short months: an anchor
--    of the 31st lands on the 28th/29th/30th where that month has no 31st.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_billing_period(
    p_tenant_id UUID,
    p_at        TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (period_start DATE, period_end DATE) AS $$
DECLARE
    _anchor_ts  TIMESTAMPTZ;
    _anchor_day INTEGER;
    _at         DATE := (p_at AT TIME ZONE 'UTC')::date;
    _month      DATE;
    _start      DATE;
BEGIN
    SELECT COALESCE(t.subscription_started_at, t.trial_started_at, t.created_at, p_at)
      INTO _anchor_ts
      FROM public.tenants t
     WHERE t.id = p_tenant_id;

    -- Unknown tenant: fall back to a calendar month so a caller still gets a
    -- usable, non-NULL window instead of an exception.
    _anchor_day := LEAST(EXTRACT(DAY FROM COALESCE(_anchor_ts, p_at))::int, 28);

    _month := date_trunc('month', _at)::date;
    _start := _month + (_anchor_day - 1);
    IF _start > _at THEN
        _month := (_month - INTERVAL '1 month')::date;
        _start := _month + (_anchor_day - 1);
    END IF;

    period_start := _start;
    period_end   := (_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.current_billing_period(UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON FUNCTION public.current_billing_period(UUID, TIMESTAMPTZ) IS
    'The monthly billing window containing p_at for one tenant, anchored on the subscription (or trial) start day, clamped to day 28 so every month has the anchor.';
