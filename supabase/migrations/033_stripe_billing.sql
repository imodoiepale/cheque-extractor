-- ============================================================================
-- 033: Stripe billing (CHECKLIST section 7)
--
-- What this adds, and why each piece is in the DATABASE rather than in the
-- application:
--
--   1. tenants.stripe_* / billing_frequency / paid_through / cancellation and
--      payment columns. These are 1:1 with a tenant, so they go on tenants
--      rather than into a subscriptions table nobody would ever join twice.
--      They are exactly the fields frontend/lib/admin/billing-data.ts lists in
--      STRIPE_FIELDS as having no source.
--
--   2. plan_check_allowance is POPULATED, and the mapping lives in ONE SQL
--      function (plan_check_allowance_for). The allowance is per BILLING
--      PERIOD, and current_billing_period() (026) is monthly for everybody —
--      so an annual customer gets a monthly allowance that resets monthly,
--      not one annual pool. Nothing here multiplies by 12 on purpose.
--
--   3. stripe_events with the event id as PRIMARY KEY. Webhook idempotency is
--      therefore a UNIQUE constraint, not an application "have I seen this?"
--      check. begin_stripe_event() returns 'new' | 'retry' | 'duplicate':
--      a Stripe retry of an event we FINISHED is a no-op, while a retry of one
--      that crashed mid-processing is still allowed through. Those two cases
--      are different and collapsing them either double-applies or loses data.
--
--   4. billing_invoices — the real invoice history. The billing page previously
--      stamped closed months "Paid" from an array index. There is now a row
--      per Stripe invoice or there is no invoice history; there is no third
--      option.
--
--   5. billing_refunds — a refund requires a Super Admin and a recorded
--      reason. The reason is a CHECK constraint and the audit entry is written
--      by a TRIGGER, so a caller that forgets to log cannot refund silently.
--      Same shape as comp_grants (029), deliberately.
--
--   6. billing_notices — "renewal reminder roughly 30 days before an annual
--      charge" needs to be send-once. UNIQUE (tenant_id, kind, period_key).
--
-- Deliberately NOT changed: public.tenant_usage_state() (029) and
-- public.usage_ledger (027). The payment-failure grace period is Stripe's own
-- dunning window: while Stripe retries, the subscription is still `active` and
-- 029's gate still allows processing; when Stripe gives up it sends
-- customer.subscription.updated with status past_due, which 029 already turns
-- into processing_allowed = false with block_reason subscription_past_due,
-- while every read path stays open. No new gate logic exists or is needed.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Stripe + subscription columns on tenants
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_frequency      TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS payment_status         TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS payment_grace_until    TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS paid_through           TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS cancel_at              TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS canceled_at            TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS stripe_synced_at       TIMESTAMPTZ;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_billing_frequency_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_billing_frequency_check
    CHECK (billing_frequency IS NULL OR billing_frequency IN ('monthly', 'annual'));

-- Stripe invoice statuses, plus NULL for "never invoiced".
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_payment_status_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN
        ('draft', 'open', 'paid', 'uncollectible', 'void', 'failed'));

-- One Stripe customer maps to one tenant. A second tenant claiming the same
-- customer id would mean two firms billed as one.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_uniq
    ON public.tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_subscription_uniq
    ON public.tenants (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.paid_through IS
    'End of the paid period (Stripe current_period_end). Cancellation runs to this date; reactivation is only possible before it.';
COMMENT ON COLUMN public.tenants.payment_grace_until IS
    'Stripe next_payment_attempt after a failed invoice. The in-app warning window; processing is not restricted until Stripe itself moves the subscription to past_due.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. The plan allowance mapping — ONE place (CHECKLIST section 7 table)
--
--    Essential 1,200 · Professional 4,500 · Scale 10,000 cheques PER MONTH.
--    Monthly and annual customers get the same monthly number; annual buys a
--    cheaper rate, not a bigger pool.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plan_check_allowance_for(p_plan TEXT)
RETURNS INTEGER AS $$
    SELECT CASE lower(btrim(COALESCE(p_plan, '')))
        WHEN 'essential'    THEN 1200
        WHEN 'professional' THEN 4500
        WHEN 'scale'        THEN 10000
        ELSE NULL            -- trial, comp, and the legacy plan names
    END
$$ LANGUAGE SQL IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.plan_check_allowance_for(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.plan_check_allowance_for(TEXT) IS
    'Included cheques PER BILLING PERIOD for a plan. The period is monthly for every customer (current_billing_period), so an annual subscriber''s allowance resets monthly. CHECKLIST section 7.';

-- Populate the column 026 added but left NULL, for any row already on a real
-- plan. IS NULL guarded so a re-run never overwrites a hand-set allowance.
UPDATE public.tenants
   SET plan_check_allowance = public.plan_check_allowance_for(plan)
 WHERE plan_check_allowance IS NULL
   AND public.plan_check_allowance_for(plan) IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. stripe_events — webhook idempotency as a constraint
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_events (
    event_id     TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    tenant_id    UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    api_version  TEXT,
    livemode     BOOLEAN,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    attempts     INTEGER NOT NULL DEFAULT 1,
    error        TEXT,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events (type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_events_unfinished
    ON public.stripe_events (received_at) WHERE processed_at IS NULL;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policy for `authenticated` at all: raw Stripe payloads are not tenant
-- data to be browsed, and the webhook runs under the service key.
DROP POLICY IF EXISTS "Service role full access to stripe_events" ON public.stripe_events;
CREATE POLICY "Service role full access to stripe_events"
    ON public.stripe_events FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.stripe_events FROM authenticated, anon;

/*
 * Claim an event for processing.
 *
 * Returns 'new'       — first time we have seen this id; process it.
 *         'retry'     — seen before but never finished (we crashed, or Stripe
 *                       retried before we committed); process it again.
 *         'duplicate' — already processed to completion; the caller must do
 *                       NOTHING and answer 200 so Stripe stops retrying.
 *
 * The INSERT ... ON CONFLICT is the whole mechanism. Two concurrent deliveries
 * of the same event cannot both get 'new', because the primary key serialises
 * them.
 */
CREATE OR REPLACE FUNCTION public.begin_stripe_event(
    p_event_id    TEXT,
    p_type        TEXT,
    p_payload     JSONB   DEFAULT '{}'::jsonb,
    p_livemode    BOOLEAN DEFAULT NULL,
    p_api_version TEXT    DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    _inserted BOOLEAN := FALSE;
    _done     TIMESTAMPTZ;
BEGIN
    IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
        RAISE EXCEPTION 'begin_stripe_event: event_id is required';
    END IF;

    INSERT INTO public.stripe_events (event_id, type, payload, livemode, api_version)
    VALUES (p_event_id, COALESCE(p_type, 'unknown'), COALESCE(p_payload, '{}'::jsonb),
            p_livemode, p_api_version)
    ON CONFLICT (event_id) DO NOTHING;

    _inserted := FOUND;
    IF _inserted THEN
        RETURN 'new';
    END IF;

    SELECT processed_at INTO _done FROM public.stripe_events WHERE event_id = p_event_id;
    IF _done IS NOT NULL THEN
        RETURN 'duplicate';
    END IF;

    UPDATE public.stripe_events
       SET attempts = attempts + 1, error = NULL
     WHERE event_id = p_event_id;
    RETURN 'retry';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.finish_stripe_event(
    p_event_id  TEXT,
    p_tenant_id UUID DEFAULT NULL,
    p_error     TEXT DEFAULT NULL
)
RETURNS VOID AS $$
    UPDATE public.stripe_events
       SET processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
           error        = p_error,
           tenant_id    = COALESCE(p_tenant_id, tenant_id)
     WHERE event_id = p_event_id;
$$ LANGUAGE SQL SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.begin_stripe_event(TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.finish_stripe_event(TEXT, UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.begin_stripe_event(TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_stripe_event(TEXT, UUID, TEXT) TO service_role;

COMMENT ON TABLE public.stripe_events IS
    'Every webhook Stripe has delivered, keyed by Stripe event id. The PRIMARY KEY is the idempotency guarantee: a retry of a finished event is absorbed by the constraint, not by an application check.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Subscription state applied from a VERIFIED webhook, never from a redirect
--
--    This is the only function that turns a tenant's access on. It is service
--    role only, so the success page cannot reach it: a redirect URL is
--    attacker-controllable and must not be able to grant paid access.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_stripe_subscription(
    p_tenant_id       UUID,
    p_customer_id     TEXT,
    p_subscription_id TEXT,
    p_plan            TEXT,
    p_frequency       TEXT,
    p_status          TEXT,
    p_paid_through    TIMESTAMPTZ DEFAULT NULL,
    p_cancel_at_period_end BOOLEAN DEFAULT FALSE,
    p_cancel_at       TIMESTAMPTZ DEFAULT NULL,
    p_canceled_at     TIMESTAMPTZ DEFAULT NULL,
    p_started_at      TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    _allowance INTEGER;
    _status    TEXT;
    _t         public.tenants;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'apply_stripe_subscription: tenant_id is required';
    END IF;

    -- Unrecognised Stripe statuses must not land in the column and break the
    -- 026 CHECK; they are mapped, and anything unknown is treated as expired
    -- rather than silently granting access.
    _status := CASE lower(COALESCE(p_status, ''))
        WHEN 'active'             THEN 'active'
        WHEN 'trialing'           THEN 'trialing'
        WHEN 'past_due'           THEN 'past_due'
        WHEN 'unpaid'             THEN 'past_due'
        WHEN 'canceled'           THEN 'canceled'
        WHEN 'incomplete'         THEN 'past_due'
        WHEN 'incomplete_expired' THEN 'expired'
        WHEN 'paused'             THEN 'expired'
        ELSE 'expired'
    END;

    _allowance := public.plan_check_allowance_for(p_plan);

    UPDATE public.tenants
       SET stripe_customer_id     = COALESCE(p_customer_id, stripe_customer_id),
           stripe_subscription_id = COALESCE(p_subscription_id, stripe_subscription_id),
           plan                   = COALESCE(lower(btrim(p_plan)), plan),
           plan_check_allowance   = COALESCE(_allowance, plan_check_allowance),
           billing_frequency      = COALESCE(p_frequency, billing_frequency),
           subscription_status    = _status,
           -- The anchor day for current_billing_period(). Set once, on the
           -- first activation, so the renewal date does not move when the
           -- plan changes mid-month.
           subscription_started_at = COALESCE(subscription_started_at, p_started_at, now()),
           paid_through           = COALESCE(p_paid_through, paid_through),
           cancel_at_period_end   = COALESCE(p_cancel_at_period_end, FALSE),
           cancel_at              = p_cancel_at,
           canceled_at            = COALESCE(p_canceled_at, canceled_at),
           stripe_synced_at       = now()
     WHERE id = p_tenant_id
     RETURNING * INTO _t;

    IF _t.id IS NULL THEN
        RAISE EXCEPTION 'apply_stripe_subscription: unknown tenant %', p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', _t.id,
        'plan', _t.plan,
        'plan_check_allowance', _t.plan_check_allowance,
        'billing_frequency', _t.billing_frequency,
        'subscription_status', _t.subscription_status,
        'paid_through', _t.paid_through
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.apply_stripe_subscription(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_subscription(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS
    'The ONLY path that grants paid access. Service role only, called from the signature-verified webhook handler. Never callable by a browser, because a success-page redirect is attacker-controllable.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. billing_invoices — real invoice history or none
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    stripe_invoice_id   TEXT NOT NULL UNIQUE,
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    number              TEXT,
    -- Stripe's invoice status verbatim. The UI never invents one.
    status              TEXT NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'usd',
    amount_due          BIGINT NOT NULL DEFAULT 0,   -- minor units, as Stripe sends
    amount_paid         BIGINT NOT NULL DEFAULT 0,
    amount_remaining    BIGINT NOT NULL DEFAULT 0,
    subtotal            BIGINT,
    total               BIGINT,
    period_start        TIMESTAMPTZ,
    period_end          TIMESTAMPTZ,
    due_date            TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    attempt_count       INTEGER,
    next_payment_attempt TIMESTAMPTZ,
    hosted_invoice_url  TEXT,
    invoice_pdf         TEXT,
    -- Overage lines are metered usage; kept so the page can show what the
    -- charge was for without a second Stripe call.
    line_summary        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant
    ON public.billing_invoices (tenant_id, period_start DESC);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant invoices" ON public.billing_invoices;
CREATE POLICY "Users can view own tenant invoices"
    ON public.billing_invoices FOR SELECT TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to billing_invoices" ON public.billing_invoices;
CREATE POLICY "Service role full access to billing_invoices"
    ON public.billing_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_invoices FROM authenticated, anon;
GRANT SELECT ON public.billing_invoices TO authenticated;

COMMENT ON TABLE public.billing_invoices IS
    'Invoice history, written only by the verified Stripe webhook. One row per Stripe invoice; status is Stripe''s own. The billing page shows these rows or shows no history — it never derives a "paid" month from a date.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. billing_refunds — Super Admin only, reason mandatory, logged by trigger
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_refunds (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

    -- Super Admin is an email allowlist (frontend/lib/super-admin.ts), not a
    -- database role, so the email is stored alongside the id — same reasoning
    -- as comp_grants.granted_by_email.
    refunded_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    refunded_by_email  TEXT NOT NULL,

    reason             TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),

    stripe_refund_id   TEXT UNIQUE,
    stripe_invoice_id  TEXT,
    stripe_charge_id   TEXT,
    stripe_payment_intent_id TEXT,
    amount             BIGINT NOT NULL CHECK (amount > 0),  -- minor units
    currency           TEXT NOT NULL DEFAULT 'usd',
    status             TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_tenant
    ON public.billing_refunds (tenant_id, created_at DESC);

ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant refunds" ON public.billing_refunds;
CREATE POLICY "Users can view own tenant refunds"
    ON public.billing_refunds FOR SELECT TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to billing_refunds" ON public.billing_refunds;
CREATE POLICY "Service role full access to billing_refunds"
    ON public.billing_refunds FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_refunds FROM authenticated, anon;
GRANT SELECT ON public.billing_refunds TO authenticated;

CREATE OR REPLACE FUNCTION public.log_billing_refund()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, old_value, new_value, metadata)
    VALUES (
        NEW.tenant_id,
        NEW.refunded_by,
        'billing.refunded',
        NULL,
        to_jsonb(NEW)::text,
        jsonb_build_object(
            'refund_id',         NEW.id,
            'stripe_refund_id',  NEW.stripe_refund_id,
            'stripe_invoice_id', NEW.stripe_invoice_id,
            'amount',            NEW.amount,
            'currency',          NEW.currency,
            'reason',            NEW.reason,
            'refunded_by_email', NEW.refunded_by_email
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_billing_refunds_audit ON public.billing_refunds;
CREATE TRIGGER trg_billing_refunds_audit
    AFTER INSERT ON public.billing_refunds
    FOR EACH ROW EXECUTE FUNCTION public.log_billing_refund();

COMMENT ON TABLE public.billing_refunds IS
    'Refunds issued by a Super Admin. The reason is a CHECK constraint and the audit entry is written by trigger, so a refund cannot be issued without both.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. billing_notices — send-once reminders (annual renewal, ~30 days out)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_notices (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    -- What the notice is ABOUT, e.g. the renewal date '2027-03-01'. Makes the
    -- unique constraint below mean "once per renewal", not "once ever".
    period_key  TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel     TEXT NOT NULL DEFAULT 'in_app',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT billing_notices_once UNIQUE (tenant_id, kind, period_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_notices_tenant
    ON public.billing_notices (tenant_id, sent_at DESC);

ALTER TABLE public.billing_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant billing_notices" ON public.billing_notices;
CREATE POLICY "Users can view own tenant billing_notices"
    ON public.billing_notices FOR SELECT TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to billing_notices" ON public.billing_notices;
CREATE POLICY "Service role full access to billing_notices"
    ON public.billing_notices FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_notices FROM authenticated, anon;
GRANT SELECT ON public.billing_notices TO authenticated;

COMMENT ON TABLE public.billing_notices IS
    'One row per notice actually sent. UNIQUE (tenant_id, kind, period_key) makes the renewal reminder send-once per renewal, so a cron that runs hourly does not email daily.';
