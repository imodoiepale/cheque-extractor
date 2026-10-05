-- ============================================================================
-- 030: Two product roles (Administrator / User), team-invitation RLS, MFA
-- ============================================================================
-- Product role mapping (see frontend/lib/roles.ts — single source of truth):
--   Administrator -> user_profiles.role = 'admin'
--   User          -> user_profiles.role = 'member'  (and legacy 'viewer')
-- No new role column is introduced. 'viewer' is kept for backwards
-- compatibility and behaves as a read-only User.
--
-- Defect-history notes honoured here:
--   * Migration 010 exists because policies ON user_profiles that read
--     user_profiles recursed. NOTHING in this file adds a policy on
--     user_profiles. Role escalation is blocked with a BEFORE UPDATE trigger
--     that only reads OLD/NEW — no query, no recursion.
--   * 001_schema.sql left `service_all ... USING (true)` permissive policies on
--     several tables. Permissive policies OR together, so a new permissive
--     policy cannot restrict anything. Every gate below is AS RESTRICTIVE,
--     which ANDs, and therefore holds even with `USING (true)` still present.
--     Restrictive policies with no TO clause also apply to `anon`, where
--     user_tenant_id() is NULL -> zero rows.
--   * service_role has BYPASSRLS in Supabase, so backend writes are unaffected.
-- Fully idempotent; follows the guarded DO $$ style of 014.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Role column exists on whichever profile table this database has
--    (001 created `profiles`; the live database uses `user_profiles` — see 007)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['user_profiles', 'profiles'] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'role'
            ) THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN role TEXT NOT NULL DEFAULT ''member''', t);
            END IF;

            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_role_check');
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (role IN (''admin'',''member'',''viewer''))',
                t, t || '_role_check'
            );

            -- MFA enrolment timestamp (cache for UI + Super Admin view; the
            -- authoritative factor list lives in auth.mfa_factors)
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ', t);
        END IF;
    END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Non-recursive role helpers
--    SECURITY DEFINER so they run as the owner and do not re-enter RLS.
--    They read the profile table but are only ever CALLED FROM POLICIES ON
--    OTHER TABLES, so there is no recursion even if the definer bypass fails.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    profile_table TEXT;
BEGIN
    SELECT table_name INTO profile_table
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('user_profiles', 'profiles')
    ORDER BY CASE table_name WHEN 'user_profiles' THEN 0 ELSE 1 END
    LIMIT 1;

    IF profile_table IS NULL THEN
        RAISE WARNING '030: no user_profiles/profiles table found; skipping role helpers';
        RETURN;
    END IF;

    EXECUTE format($f$
        CREATE OR REPLACE FUNCTION public.user_role()
        RETURNS TEXT AS $body$
          SELECT role FROM public.%I WHERE id = auth.uid()
        $body$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
    $f$, profile_table);

    -- user_tenant_id() already exists (migration 008) but recreate defensively
    -- against the same table so fresh databases get it too.
    EXECUTE format($f$
        CREATE OR REPLACE FUNCTION public.user_tenant_id()
        RETURNS UUID AS $body$
          SELECT tenant_id FROM public.%I WHERE id = auth.uid()
        $body$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;
    $f$, profile_table);
END $$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(public.user_role() = 'admin', FALSE)
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public;

-- True for a service-role API request, and for a direct database session with
-- no JWT at all (psql / migrations), so operators are not locked out.
-- Deliberately does NOT look at current_user: callers below are SECURITY
-- DEFINER, where current_user is the function owner and would always match.
CREATE OR REPLACE FUNCTION public.is_service_request()
RETURNS BOOLEAN AS $$
  SELECT current_setting('request.jwt.claims', TRUE) IS NULL
      OR current_setting('request.jwt.claims', TRUE) = ''
      OR COALESCE(
           current_setting('request.jwt.claims', TRUE)::jsonb ->> 'role' = 'service_role',
           FALSE
         )
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Privilege-escalation guard on the profile table
--    A self-only UPDATE policy (migration 010) would otherwise let a 'member'
--    set their own role to 'admin'. Trigger only, to avoid RLS recursion.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_service_request() THEN
        RETURN NEW;
    END IF;

    -- Nobody may move themselves between firms.
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'tenant_id cannot be changed by a user request';
    END IF;

    -- Role changes never happen on the caller's own row, and only an existing
    -- admin may change anyone's role. OLD.role is read from the row itself,
    -- so no query and no recursion.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF auth.uid() = OLD.id THEN
            RAISE EXCEPTION 'you cannot change your own role';
        END IF;
        IF COALESCE(public.user_role(), '') <> 'admin' THEN
            RAISE EXCEPTION 'only an Administrator may change roles';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['user_profiles', 'profiles'] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS guard_profile_privileges ON public.%I', t);
            EXECUTE format(
                'CREATE TRIGGER guard_profile_privileges BEFORE UPDATE ON public.%I '
                || 'FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges()', t
            );
        END IF;
    END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. team_invitations: tenant-scoped AND Administrator-only
--    RESTRICTIVE with no TO clause => applies to anon too (zero rows).
-- ──────────────────────────────────────────────────────────────────────────────
-- VERIFIED AGAINST THE LIVE DATABASE: team_invitations does NOT exist there.
-- 001_schema.sql declares it, but 001 was never fully applied (`profiles` and
-- `tenant_settings` are missing too). So create it here, with 001's definition
-- verbatim, rather than assuming it is present.
CREATE TABLE IF NOT EXISTS public.team_invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin','member','viewer')),
    invited_by  UUID REFERENCES auth.users(id),
    status      TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','expired')),
    token       TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_invitations_tenant_idx
    ON public.team_invitations (tenant_id, status);
CREATE INDEX IF NOT EXISTS team_invitations_email_idx
    ON public.team_invitations (lower(email));

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- The invite token is a bearer secret; it is only ever read through the
-- service client in /api/team/invitations/[token]. No anon read path.
DROP POLICY IF EXISTS "team_invitations_tenant_admin_only" ON public.team_invitations;
CREATE POLICY "team_invitations_tenant_admin_only"
  ON public.team_invitations
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = public.user_tenant_id() AND public.is_tenant_admin())
  WITH CHECK (tenant_id = public.user_tenant_id() AND public.is_tenant_admin());

-- Permissive counterpart so Administrators actually can read and write.
DROP POLICY IF EXISTS "team_invitations_admin_rw" ON public.team_invitations;
CREATE POLICY "team_invitations_admin_rw"
  ON public.team_invitations
  FOR ALL
  TO authenticated
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Administrator-only writes on the account-editing / reporting surfaces
--    (Users get no billing, no reports, no account editing.)
--    RESTRICTIVE so it holds alongside any pre-existing USING (true) policy.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
    has_tenant BOOLEAN;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tenant_settings',   -- account editing (absent in the live db; guarded)
        'integrations',      -- QB credentials / account editing
        'qb_connections',    -- QB company connections
        'export_history'     -- reports / exports
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
        ) INTO has_tenant;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write_only', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_tenant_admin())',
            t || '_admin_write_only', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update_only', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE USING (public.is_tenant_admin()) WITH CHECK (public.is_tenant_admin())',
            t || '_admin_update_only', t
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete_only', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING (public.is_tenant_admin())',
            t || '_admin_delete_only', t
        );

        -- Tenant isolation on every operation, anon included.
        IF has_tenant THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
                || 'USING (tenant_id = public.user_tenant_id()) '
                || 'WITH CHECK (tenant_id = public.user_tenant_id())',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

-- export_history SELECT is a report, so Users may not read it either.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'export_history'
    ) THEN
        DROP POLICY IF EXISTS "export_history_admin_read_only" ON public.export_history;
        CREATE POLICY "export_history_admin_read_only"
          ON public.export_history
          AS RESTRICTIVE
          FOR SELECT
          USING (public.is_tenant_admin());
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5b. app_settings — close a live secret leak.
--
--  VERIFIED ON THE LIVE DATABASE: a plain anon-key SELECT on public.app_settings
--  returned a row, and that row carries gemini_api_key, qbo_access_token and
--  qbo_refresh_token. Anyone holding the public anon key could read them.
--
--  The only reader anywhere in the codebase is backend/api_server.py, which
--  talks to PostgREST with the SERVICE key and therefore bypasses RLS. Nothing
--  in frontend/ or chrome-extension/ touches the table. So the correct policy
--  is: no client access at all, by any key but the service key.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'app_settings'
    ) THEN
        ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "app_settings_no_client_access" ON public.app_settings;
        CREATE POLICY "app_settings_no_client_access"
          ON public.app_settings
          AS RESTRICTIVE
          FOR ALL
          USING (FALSE)
          WITH CHECK (FALSE);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5c. audit_logs — reconcile with the live column names.
--
--  001_schema.sql declares (field, old_value, new_value, job_id). The LIVE
--  table has (entity_type, entity_id, old_values, new_values) instead. The
--  application writer (frontend/lib/team-helpers.ts auditLog) targets the LIVE
--  shape; these guards add those columns to any database built from 001 so the
--  same writer works on both.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) THEN
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id    TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values   JSONB;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values   JSONB;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}'::jsonb;

        -- Audit entries are not a report a User may read, and no client should
        -- ever rewrite one. Reads are Administrator + own tenant; writes are
        -- service-only (every writer in the app uses the service client).
        ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
        CREATE POLICY "audit_logs_admin_read"
          ON public.audit_logs
          AS RESTRICTIVE
          FOR SELECT
          USING (tenant_id = public.user_tenant_id() AND public.is_tenant_admin());

        DROP POLICY IF EXISTS "audit_logs_no_client_write" ON public.audit_logs;
        CREATE POLICY "audit_logs_no_client_write"
          ON public.audit_logs
          AS RESTRICTIVE
          FOR UPDATE
          USING (FALSE)
          WITH CHECK (FALSE);

        DROP POLICY IF EXISTS "audit_logs_no_client_delete" ON public.audit_logs;
        CREATE POLICY "audit_logs_no_client_delete"
          ON public.audit_logs
          AS RESTRICTIVE
          FOR DELETE
          USING (FALSE);
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. MFA recovery codes
--    Supabase TOTP has no built-in backup codes. A redeemed code lets the user
--    unenrol their factor and re-enrol (see /api/auth/mfa/recover).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx
    ON public.mfa_recovery_codes (user_id) WHERE used_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_codes_unique
    ON public.mfa_recovery_codes (user_id, code_hash);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Hashes are never served to the browser. Only the service client reads them.
-- Deliberately NO permissive policy: authenticated and anon both get zero rows.
DROP POLICY IF EXISTS "mfa_recovery_codes_no_client_access" ON public.mfa_recovery_codes;
CREATE POLICY "mfa_recovery_codes_no_client_access"
  ON public.mfa_recovery_codes
  AS RESTRICTIVE
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Tenant-level MFA policy flag (Administrators are always required;
--    this lets a firm additionally require it of every member)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
    ) THEN
        ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS require_mfa_all_users BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;
