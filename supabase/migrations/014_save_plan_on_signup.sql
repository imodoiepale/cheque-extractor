-- ============================================================================
-- 014: Save plan tier on signup + update CHECK constraint
-- ============================================================================

-- 1. Add plan column if it doesn't exist, then set up CHECK constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'plan'
    ) THEN
        ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
    END IF;
END $$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check 
    CHECK (plan IN ('free', 'starter', 'professional', 'enterprise', 'pro'));

-- 2. Migrate any existing 'free' plans to 'starter' (optional, keeps old data valid)
-- UPDATE tenants SET plan = 'starter' WHERE plan = 'free';

-- 3. Update handle_new_user trigger to save plan from signup metadata
-- Handles both user_profiles and profiles table names (see migration 007)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
        CREATE OR REPLACE FUNCTION handle_new_user()
        RETURNS TRIGGER AS $func$
        DECLARE
            _tenant_id UUID;
            _company_name TEXT;
            _full_name TEXT;
            _plan TEXT;
        BEGIN
            _company_name := COALESCE(
                NEW.raw_user_meta_data->>'company_name',
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1)
            );
            _full_name := COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1)
            );
            _plan := COALESCE(NEW.raw_user_meta_data->>'plan', 'starter');
            IF _plan NOT IN ('starter', 'professional', 'enterprise') THEN
                _plan := 'starter';
            END IF;

            INSERT INTO tenants (name, slug, plan)
            VALUES (
                _company_name,
                lower(regexp_replace(_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8),
                _plan
            )
            RETURNING id INTO _tenant_id;

            INSERT INTO user_profiles (id, tenant_id, email, full_name, role)
            VALUES (NEW.id, _tenant_id, NEW.email, _full_name, 'admin');

            IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_settings') THEN
                INSERT INTO tenant_settings (tenant_id) VALUES (_tenant_id);
            END IF;

            RETURN NEW;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Error in handle_new_user: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
                RAISE EXCEPTION 'Database error saving new user: %', SQLERRM;
        END;
        $func$ LANGUAGE plpgsql SECURITY DEFINER;
    ELSE
        CREATE OR REPLACE FUNCTION handle_new_user()
        RETURNS TRIGGER AS $func$
        DECLARE
            _tenant_id UUID;
            _company_name TEXT;
            _full_name TEXT;
            _plan TEXT;
        BEGIN
            _company_name := COALESCE(
                NEW.raw_user_meta_data->>'company_name',
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1)
            );
            _full_name := COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1)
            );
            _plan := COALESCE(NEW.raw_user_meta_data->>'plan', 'starter');
            IF _plan NOT IN ('starter', 'professional', 'enterprise') THEN
                _plan := 'starter';
            END IF;

            INSERT INTO tenants (name, slug, plan)
            VALUES (
                _company_name,
                lower(regexp_replace(_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8),
                _plan
            )
            RETURNING id INTO _tenant_id;

            INSERT INTO profiles (id, tenant_id, email, full_name, role)
            VALUES (NEW.id, _tenant_id, NEW.email, _full_name, 'admin');

            IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_settings') THEN
                INSERT INTO tenant_settings (tenant_id) VALUES (_tenant_id);
            END IF;

            RETURN NEW;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Error in handle_new_user: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
                RAISE EXCEPTION 'Database error saving new user: %', SQLERRM;
        END;
        $func$ LANGUAGE plpgsql SECURITY DEFINER;
    END IF;
END $$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
