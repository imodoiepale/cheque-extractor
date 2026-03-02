-- Fix Row-Level Security for proper tenant isolation
-- This migration ensures each user only sees their own tenant's data

-- Create helper function in public schema (not auth schema - permission denied)
CREATE OR REPLACE FUNCTION public.user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Add tenant_id to qb_entries table
ALTER TABLE public.qb_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Add tenant_id to quickbooks_entries table
ALTER TABLE public.quickbooks_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Update existing entries to belong to first tenant (temporary fix for existing data)
UPDATE public.qb_entries SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;
UPDATE public.quickbooks_entries SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;

-- Enable RLS on QB tables
ALTER TABLE public.qb_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quickbooks_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for qb_entries
DROP POLICY IF EXISTS "Users can view own tenant qb_entries" ON public.qb_entries;
CREATE POLICY "Users can view own tenant qb_entries"
  ON public.qb_entries FOR SELECT
  USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can insert own tenant qb_entries" ON public.qb_entries;
CREATE POLICY "Users can insert own tenant qb_entries"
  ON public.qb_entries FOR INSERT
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can update own tenant qb_entries" ON public.qb_entries;
CREATE POLICY "Users can update own tenant qb_entries"
  ON public.qb_entries FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can delete own tenant qb_entries" ON public.qb_entries;
CREATE POLICY "Users can delete own tenant qb_entries"
  ON public.qb_entries FOR DELETE
  USING (tenant_id = public.user_tenant_id());

-- Create RLS policies for quickbooks_entries
DROP POLICY IF EXISTS "Users can view own tenant quickbooks_entries" ON public.quickbooks_entries;
CREATE POLICY "Users can view own tenant quickbooks_entries"
  ON public.quickbooks_entries FOR SELECT
  USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can insert own tenant quickbooks_entries" ON public.quickbooks_entries;
CREATE POLICY "Users can insert own tenant quickbooks_entries"
  ON public.quickbooks_entries FOR INSERT
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can update own tenant quickbooks_entries" ON public.quickbooks_entries;
CREATE POLICY "Users can update own tenant quickbooks_entries"
  ON public.quickbooks_entries FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can delete own tenant quickbooks_entries" ON public.quickbooks_entries;
CREATE POLICY "Users can delete own tenant quickbooks_entries"
  ON public.quickbooks_entries FOR DELETE
  USING (tenant_id = public.user_tenant_id());

-- Update existing RLS policies to use public.user_tenant_id() instead of auth.user_tenant_id()
DROP POLICY IF EXISTS "Users can view own tenant checks" ON public.checks;
CREATE POLICY "Users can view own tenant checks"
  ON public.checks FOR SELECT
  USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can insert checks for own tenant" ON public.checks;
CREATE POLICY "Users can insert checks for own tenant"
  ON public.checks FOR INSERT
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can update own tenant checks" ON public.checks;
CREATE POLICY "Users can update own tenant checks"
  ON public.checks FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Users can delete own tenant checks" ON public.checks;
CREATE POLICY "Users can delete own tenant checks"
  ON public.checks FOR DELETE
  USING (tenant_id = public.user_tenant_id());
