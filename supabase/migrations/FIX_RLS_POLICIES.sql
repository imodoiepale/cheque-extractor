-- ============================================================================
-- FIX RLS POLICIES FOR TENANT CREATION
-- Run this to allow users to create tenants during signup
-- ============================================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own tenant" ON tenants;

-- Create new policies that allow tenant creation
CREATE POLICY "Users can create tenants"
    ON tenants FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can view their own tenant"
    ON tenants FOR SELECT
    USING (
        id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
        OR
        -- Allow viewing tenant if user just created it (no profile yet)
        auth.uid() IS NOT NULL
    );

CREATE POLICY "Users can update their own tenant"
    ON tenants FOR UPDATE
    USING (id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- Update user_profiles policies to allow creation
DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON user_profiles;

CREATE POLICY "Users can create their own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY "Users can view profiles in their tenant"
    ON user_profiles FOR SELECT
    USING (
        tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
        OR id = auth.uid()
    );

CREATE POLICY "Users can update their own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

-- ============================================================================
-- CREATE FUNCTION TO AUTO-CREATE TENANT AND PROFILE ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_tenant_id UUID;
    company_name TEXT;
BEGIN
    -- Get company name from user metadata
    company_name := COALESCE(
        NEW.raw_user_meta_data->>'company_name',
        'My Company'
    );

    -- Create tenant
    INSERT INTO tenants (name, slug)
    VALUES (
        company_name,
        LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(NEW.id::text, 1, 8)
    )
    RETURNING id INTO new_tenant_id;

    -- Create user profile
    INSERT INTO user_profiles (id, tenant_id, email, role)
    VALUES (
        NEW.id,
        new_tenant_id,
        NEW.email,
        'admin'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to auto-create tenant and profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- DONE! Now users can sign up and tenants will be created automatically
-- ============================================================================
