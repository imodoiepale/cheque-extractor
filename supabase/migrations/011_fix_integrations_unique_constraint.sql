-- Fix integrations table unique constraint to be per-tenant
-- Current: UNIQUE(provider) - only one row per provider globally (breaks multi-tenancy)
-- Fixed: UNIQUE(tenant_id, provider) - one row per provider per tenant

-- Drop the old constraint
ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_key;

-- Add the new per-tenant constraint
ALTER TABLE public.integrations ADD CONSTRAINT integrations_tenant_provider_key 
  UNIQUE(tenant_id, provider);
