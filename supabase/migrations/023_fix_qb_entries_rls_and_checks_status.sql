-- Migration 023: Fix qb_entries RLS + add 'rejected' to checks.status constraint
--
-- Problem 1: Migration 005 created policies on qb_entries using `user_id = auth.uid()`
--   but qb_entries has NO user_id column → those CREATE POLICY statements errored,
--   leaving only the service_role policy. Authenticated users (anon key + JWT) cannot
--   SELECT or UPDATE qb_entries. Fix: replace with tenant_id-based policies.
--
-- Problem 2: checks.status CHECK constraint missing 'rejected'. The "Reject" button
--   sends status='rejected', which violates the constraint if it ever touches checks.id.
--   Fix: drop and recreate the constraint to include 'rejected'.

-- ── 1. Fix qb_entries RLS ─────────────────────────────────────────────────────

-- Drop the broken user_id-based policies (they may or may not exist)
DROP POLICY IF EXISTS "Users can view own qb entries" ON public.qb_entries;
DROP POLICY IF EXISTS "Users can manage own qb entries" ON public.qb_entries;

-- Ensure RLS is enabled
ALTER TABLE public.qb_entries ENABLE ROW LEVEL SECURITY;

-- Drop new policies too in case migration was partially applied
DROP POLICY IF EXISTS "Users can select own tenant qb_entries" ON public.qb_entries;
DROP POLICY IF EXISTS "Users can insert own tenant qb_entries" ON public.qb_entries;
DROP POLICY IF EXISTS "Users can update own tenant qb_entries" ON public.qb_entries;
DROP POLICY IF EXISTS "Users can delete own tenant qb_entries" ON public.qb_entries;

-- SELECT: authenticated users can read their own tenant's entries
CREATE POLICY "Users can select own tenant qb_entries"
  ON public.qb_entries FOR SELECT
  USING (tenant_id = public.user_tenant_id());

-- INSERT: authenticated users can insert for their own tenant
CREATE POLICY "Users can insert own tenant qb_entries"
  ON public.qb_entries FOR INSERT
  WITH CHECK (tenant_id = public.user_tenant_id());

-- UPDATE: authenticated users can update their own tenant's entries (needed for SAVE_QB_TXN)
CREATE POLICY "Users can update own tenant qb_entries"
  ON public.qb_entries FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

-- DELETE: authenticated users can delete their own tenant's entries (used by pull-checks re-sync)
CREATE POLICY "Users can delete own tenant qb_entries"
  ON public.qb_entries FOR DELETE
  USING (tenant_id = public.user_tenant_id());

-- Service role retains full access
DROP POLICY IF EXISTS "Service role can manage qb_entries" ON public.qb_entries;
DROP POLICY IF EXISTS "Service role full access to qb_entries" ON public.qb_entries;
CREATE POLICY "Service role full access to qb_entries"
  ON public.qb_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. Add 'rejected' to checks.status constraint ────────────────────────────

ALTER TABLE public.checks
  DROP CONSTRAINT IF EXISTS checks_status_check;

ALTER TABLE public.checks
  ADD CONSTRAINT checks_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'processing'::text,
      'pending_review'::text,
      'approved'::text,
      'rejected'::text,
      'exported'::text,
      'error'::text
    ])
  );
