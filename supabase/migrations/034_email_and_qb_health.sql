-- ============================================================================
-- 034: Email delivery, unsubscribe preferences, and QuickBooks connection
--      health (CHECKLIST section 9, docs/EMAIL-SPEC-REVIEW.md sections 2 and 5)
--
-- What this adds, and why each piece is in the DATABASE rather than in the
-- application:
--
--   1. qb_connections.status / status_detail / status_checked_at /
--      status_changed_at. `is_active` means "the company currently selected",
--      NOT "the connection works" — the unique partial index in migration 013
--      allows exactly one active row per tenant, so is_active can never carry
--      health. Both token-refresh paths previously wrote a console line and
--      returned, so a dead connection was invisible until a user tripped over
--      it. These columns are where a refresh failure now lands, and they are
--      the trigger for emails 11/12/13.
--
--   2. email_log — one row per send ATTEMPT, including attempts that never
--      left the process because RESEND_API_KEY is unset. A missing email has
--      to be diagnosable later, and "we never tried" and "the provider
--      rejected it" are different answers.
--
--   3. email_preferences — the unsubscribe store the published privacy policy
--      already promises. One row per (tenant, email) with an opaque token, so
--      the unsubscribe link carries no address in its query string and can be
--      revoked by rotating one row. `unsubscribed_at IS NULL` means subscribed.
--
--   4. NO new send-once table. Send-once already exists as a database
--      constraint: billing_notices' UNIQUE (tenant_id, kind, period_key) from
--      migration 033. This migration only widens its COMMENT, because the
--      mailer now claims a row there before every non-repeatable email. Adding
--      a second mechanism would mean two things to keep in step.
--
-- Idempotent, and guarded rather than assuming earlier migrations ran:
-- migrations 026-033 have never been applied to any database, so every block
-- below checks for what it depends on instead of failing the whole file.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. qb_connections health
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.qb_connections') IS NULL THEN
        RAISE NOTICE '034: public.qb_connections absent, skipping health columns';
        RETURN;
    END IF;

    ALTER TABLE public.qb_connections
        ADD COLUMN IF NOT EXISTS status            TEXT        NOT NULL DEFAULT 'connected',
        ADD COLUMN IF NOT EXISTS status_detail     TEXT,
        ADD COLUMN IF NOT EXISTS status_checked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

    -- 'connected'       working as far as we know
    -- 'needs_reconnect' the refresh token is dead; only the user can fix it
    -- 'error'           a transient failure (network, Intuit 5xx, rate limit)
    -- 'revoked'         Intuit says the grant is gone
    -- 'unknown'         we could not find out. The health check records this
    --                   when credentials are absent or Intuit is unreachable,
    --                   because a connection wrongly marked dead emails a firm
    --                   a reconnect notice for no reason. Only 'needs_reconnect'
    --                   and 'revoked' ever send that email.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.qb_connections'::regclass
           AND conname  = 'qb_connections_status_check'
    ) THEN
        ALTER TABLE public.qb_connections
            ADD CONSTRAINT qb_connections_status_check
            CHECK (status IN ('connected', 'needs_reconnect', 'error', 'revoked', 'unknown'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qb_connections_status
    ON public.qb_connections (status, status_changed_at DESC);

DO $$
BEGIN
    IF to_regclass('public.qb_connections') IS NOT NULL THEN
        COMMENT ON COLUMN public.qb_connections.status IS
            'Connection HEALTH: connected | needs_reconnect | error | revoked | unknown. Distinct from is_active, which means "the company currently selected". Written by both token-refresh paths (lib/qb-health.ts) and by the scheduled health check.';
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. email_log — every send attempt, including the ones we never made
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable: a send can precede tenant resolution (an invite to an address
    -- that has no account yet still belongs to the inviting firm, but a
    -- provider bounce handler may not know one).
    tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    to_email      TEXT NOT NULL,
    template      TEXT NOT NULL,
    subject       TEXT NOT NULL,
    -- sent                   the provider accepted it
    -- failed                 we tried and the provider or network said no
    -- skipped_unconfigured   no RESEND_API_KEY; nothing left the process
    -- suppressed             recipient has unsubscribed from this category
    -- already_sent           send-once claim was already held
    status        TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'transactional',
    provider_id   TEXT,
    error         TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT email_log_status_check
        CHECK (status IN ('sent', 'failed', 'skipped_unconfigured', 'suppressed', 'already_sent')),
    CONSTRAINT email_log_category_check
        CHECK (category IN ('transactional', 'notification'))
);

CREATE INDEX IF NOT EXISTS idx_email_log_tenant   ON public.email_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to       ON public.email_log (to_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON public.email_log (template, status, created_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant email_log" ON public.email_log;
CREATE POLICY "Users can view own tenant email_log"
    ON public.email_log FOR SELECT TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to email_log" ON public.email_log;
CREATE POLICY "Service role full access to email_log"
    ON public.email_log FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.email_log FROM authenticated, anon;
GRANT SELECT ON public.email_log TO authenticated;

COMMENT ON TABLE public.email_log IS
    'One row per send ATTEMPT. status=skipped_unconfigured means RESEND_API_KEY was unset and nothing was sent — the transport never pretends. A missing email is diagnosed from here.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. email_preferences — the unsubscribe store
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_preferences (
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    -- Stored lower-cased by the application (lib/team-helpers.normaliseEmail).
    email           TEXT NOT NULL,
    -- Opaque, revocable, and NOT derived from the address, so the unsubscribe
    -- URL carries no personal data and rotating the row kills old links.
    token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    -- NULL = subscribed. One switch: there is one non-transactional category
    -- today (usage and trial notices) and a second column nobody reads is a
    -- second thing to keep in step.
    unsubscribed_at TIMESTAMPTZ,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_preferences_email ON public.email_preferences (email);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant email_preferences" ON public.email_preferences;
CREATE POLICY "Users can view own tenant email_preferences"
    ON public.email_preferences FOR SELECT TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to email_preferences" ON public.email_preferences;
CREATE POLICY "Service role full access to email_preferences"
    ON public.email_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The unsubscribe route is unauthenticated by necessity (the recipient clicks
-- a link in a mail client), so it runs under the service role and the token is
-- the authorisation. `anon` gets nothing: a token must not be enumerable.
REVOKE ALL ON public.email_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.email_preferences FROM authenticated;
GRANT SELECT ON public.email_preferences TO authenticated;

COMMENT ON TABLE public.email_preferences IS
    'Unsubscribe store for non-transactional email. unsubscribed_at IS NULL means subscribed. The token is random, not derived from the address, so the unsubscribe URL leaks nothing and can be revoked.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. billing_notices is now the app-wide send-once ledger (no new table)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.billing_notices') IS NULL THEN
        RAISE NOTICE '034: public.billing_notices absent (apply 033 first) — the mailer will report send_once_unavailable at runtime';
        RETURN;
    END IF;

    COMMENT ON TABLE public.billing_notices IS
        'One row per notice actually sent, for ANY send-once email and not only billing ones (migration 034 widened this). UNIQUE (tenant_id, kind, period_key) is the send-once guarantee: lib/email/send.ts claims a row BEFORE sending, so a retried cron is a no-op by constraint rather than by an application "have I sent this?" check.';
END $$;
