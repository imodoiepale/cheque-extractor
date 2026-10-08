-- ============================================================================
-- 036: qb_accounts — the cached chart of bank and credit-card accounts that
--      backs the account switcher (CHECKLIST section 4)
--
-- WHY A TABLE AND NOT A LIVE QBO QUERY
--
-- The account switcher sits in the top bar, so it is mounted on every page of
-- the app. Querying QuickBooks per render would be:
--
--   * slow — an Intuit round trip (plus a token refresh when stale) in front
--     of chrome that must paint immediately; and
--   * a quota risk that fails CLOSED. Intuit's free tier is 500,000 reads a
--     month and it BLOCKS rather than bills when exceeded. A switcher on every
--     page turns ordinary navigation into read volume, and the thing that
--     breaks when the quota trips is not the switcher — it is every customer's
--     sync, all at once, until the month rolls over. A cache makes the read
--     count a function of how often someone presses Refresh, not of how many
--     pages they visit.
--
-- The data is also slow-moving: a firm's chart of accounts changes far less
-- often than its transactions. Balances drift, which is why the switcher has
-- an explicit refresh action and why `synced_at` is surfaced in the UI rather
-- than hidden — a stale number that admits its age is honest, a stale number
-- presented as live is not.
--
-- WHAT IS DELIBERATELY NOT STORED
--
-- QBO's `Account.AcctNum` is the full account number. Only the last four are
-- kept here, derived at sync time. The switcher shows four digits, so storing
-- the rest would be holding a bank account number we have no use for.
--
-- Scoped per (tenant, realm) because a firm connects several QuickBooks
-- companies and each has its own chart of accounts. RLS is tenant-scoped the
-- same way every other table here is; writes go through the service role from
-- pages/api/qbo/accounts.ts, so `authenticated` gets SELECT only.
--
-- Idempotent and guarded, matching migrations 026-035: earlier migrations are
-- not assumed to have run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.qb_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    -- Not a FK to qb_connections: a realm can be disconnected and reconnected,
    -- and the cached chart should survive that rather than cascade away.
    realm_id             TEXT NOT NULL,
    -- QBO Account.Id, unique within a realm.
    qb_account_id        TEXT NOT NULL,
    name                 TEXT NOT NULL,
    fully_qualified_name TEXT,
    -- QBO AccountType. Only 'Bank' and 'Credit Card' are synced — those are
    -- the two groups the switcher shows, and the old query hardcoded
    -- AccountType = 'Bank', which is exactly why credit cards were invisible.
    account_type         TEXT NOT NULL,
    account_sub_type     TEXT,
    -- Last four of AcctNum. The rest is never stored (see header).
    last_four            TEXT,
    current_balance      NUMERIC(14, 2),
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT qb_accounts_unique UNIQUE (tenant_id, realm_id, qb_account_id),
    CONSTRAINT qb_accounts_type_check CHECK (account_type IN ('Bank', 'Credit Card')),
    CONSTRAINT qb_accounts_last_four_check CHECK (last_four IS NULL OR last_four ~ '^[0-9]{1,4}$')
);

-- The switcher's only query: one realm, grouped by type, name order.
CREATE INDEX IF NOT EXISTS idx_qb_accounts_realm
    ON public.qb_accounts (tenant_id, realm_id, account_type, name);

ALTER TABLE public.qb_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regprocedure('public.user_tenant_id()') IS NULL THEN
        RAISE NOTICE '036: public.user_tenant_id() absent — qb_accounts RLS policy skipped, service role still works';
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "Users can view own tenant qb_accounts" ON public.qb_accounts;
    CREATE POLICY "Users can view own tenant qb_accounts"
        ON public.qb_accounts FOR SELECT TO authenticated
        USING (tenant_id = public.user_tenant_id());
END $$;

DROP POLICY IF EXISTS "Service role full access to qb_accounts" ON public.qb_accounts;
CREATE POLICY "Service role full access to qb_accounts"
    ON public.qb_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The sync is a server-side upsert under the service role, so a signed-in user
-- can read the cache but can never write a balance into it.
REVOKE ALL ON public.qb_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.qb_accounts FROM authenticated;
GRANT SELECT ON public.qb_accounts TO authenticated;

COMMENT ON TABLE public.qb_accounts IS
    'Cached QBO Bank and Credit Card accounts per (tenant, realm), backing the account switcher. The switcher is in the top bar on every page, so this exists so that navigating the app does not spend Intuit read quota — the free tier blocks rather than bills at 500k reads/month. Refreshed on demand by pages/api/qbo/accounts.ts; synced_at is shown in the UI.';

COMMENT ON COLUMN public.qb_accounts.last_four IS
    'Last four of QBO Account.AcctNum. The full number is deliberately never stored — the UI shows four digits and we have no use for the rest.';
