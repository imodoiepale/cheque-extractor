-- ============================================================================
-- 031: Close the anon-key read on public.app_settings
--
-- WHY THIS IS SEPARATE FROM 030
-- 030 also closes this, but 030 is a large roles/RLS/MFA migration. This hole
-- should be closable on its own, immediately, without taking the rest.
--
-- VERIFIED ON THE LIVE DATABASE (2026-10-05):
--   GET /rest/v1/app_settings?select=*   with the PUBLIC anon key
--   -> 200, 1 row, columns:
--      gemini_api_key, qbo_access_token, qbo_refresh_token, qbo_company_id,
--      qbo_token_expires_at, qbo_connected, tenant_id, id, created_at, updated_at
--
-- At the time of verification those three secret columns were all NULL, so
-- nothing was actually exposed yet. This is an open door on an empty safe --
-- which matters, because the safe is wired to fill itself: the live endpoint at
-- backend/api_server.py (save-settings, ~line 2731) writes gemini_api_key into
-- this very row. The first time anyone saves a key through Settings, that key
-- becomes readable by anybody holding the anon key -- and the anon key is
-- shipped in the frontend bundle AND in the Chrome extension's
-- BOOTSTRAP_CONFIG, so "anybody" means any visitor or any extension user.
--
-- 009 intended to enable RLS here, but 009 was never applied to this database
-- (its tenant_id column is absent from `integrations` live), so the table has
-- been open since it was created.
--
-- NO CLIENT NEEDS THIS TABLE. The only reader anywhere in the codebase is
-- backend/api_server.py, which uses the SERVICE key and therefore bypasses RLS.
-- Nothing in frontend/ or chrome-extension/ touches it. So the correct policy
-- is not "scope it per tenant", it is "no client access at all".
-- ============================================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'app_settings'
    ) THEN
        RAISE NOTICE '031: public.app_settings does not exist, nothing to close';
        RETURN;
    END IF;

    ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

    -- Drop every policy on the table. Permissive policies OR together, so one
    -- leftover permissive policy would keep the table readable no matter what
    -- is added alongside it. 009 named two; drop whatever is actually there.
    FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'app_settings'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_settings', pol.policyname);
    END LOOP;

    -- Deny-all for every client role. RESTRICTIVE so it ANDs with anything
    -- added later rather than being OR'd away, and with no TO clause so it
    -- covers anon and authenticated alike. service_role has BYPASSRLS, so the
    -- backend is unaffected.
    CREATE POLICY "app_settings_no_client_access"
        ON public.app_settings
        AS RESTRICTIVE
        FOR ALL
        USING (false)
        WITH CHECK (false);

    -- Belt and braces: if the policy were ever dropped, there is still no
    -- privilege to use.
    REVOKE ALL ON public.app_settings FROM anon, authenticated;

    RAISE NOTICE '031: public.app_settings closed to all client roles';
END $$;

COMMENT ON TABLE public.app_settings IS
    'Service-role only. Holds provider credentials; no client role may read or '
    'write it (see migration 031). Read exclusively by the Python backend with '
    'the service key.';
