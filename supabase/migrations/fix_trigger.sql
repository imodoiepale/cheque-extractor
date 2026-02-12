-- ============================================================================
-- FIX: Replace handle_new_user trigger with a more defensive version
-- Paste this into Supabase SQL Editor and Run
-- ============================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop existing function
DROP FUNCTION IF EXISTS handle_new_user();

-- Recreate with better error handling and defensive coding
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _tenant_id UUID;
    _name TEXT;
    _slug TEXT;
BEGIN
    -- Safely extract name from metadata
    _name := COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        NEW.raw_user_meta_data ->> 'company_name',
        split_part(NEW.email, '@', 1)
    );

    -- Generate a unique slug
    _slug := lower(regexp_replace(_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8);

    -- Create tenant
    INSERT INTO public.tenants (name, slug)
    VALUES (_name || '''s Workspace', _slug)
    RETURNING id INTO _tenant_id;

    -- Create profile
    INSERT INTO public.profiles (id, tenant_id, email, full_name, role)
    VALUES (NEW.id, _tenant_id, NEW.email, _name, 'admin');

    -- Create default settings
    INSERT INTO public.tenant_settings (tenant_id)
    VALUES (_tenant_id);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block signup
    RAISE WARNING 'handle_new_user failed: % %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
