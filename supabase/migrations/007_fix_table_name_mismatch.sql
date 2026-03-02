-- First, let's check what table actually exists and fix the function accordingly
-- This handles both 'profiles' and 'user_profiles' table names

DO $$
BEGIN
    -- Check if user_profiles exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
        -- Use user_profiles
        CREATE OR REPLACE FUNCTION handle_new_user()
        RETURNS TRIGGER AS $func$
        DECLARE
            _tenant_id UUID;
            _company_name TEXT;
            _full_name TEXT;
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
            
            INSERT INTO tenants (name, slug)
            VALUES (
                _company_name,
                lower(regexp_replace(_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8)
            )
            RETURNING id INTO _tenant_id;
            
            -- Use user_profiles table
            INSERT INTO user_profiles (id, tenant_id, email, full_name, role)
            VALUES (NEW.id, _tenant_id, NEW.email, _full_name, 'admin');
            
            -- Check if tenant_settings table exists before inserting
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
        -- Use profiles
        CREATE OR REPLACE FUNCTION handle_new_user()
        RETURNS TRIGGER AS $func$
        DECLARE
            _tenant_id UUID;
            _company_name TEXT;
            _full_name TEXT;
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
            
            INSERT INTO tenants (name, slug)
            VALUES (
                _company_name,
                lower(regexp_replace(_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 8)
            )
            RETURNING id INTO _tenant_id;
            
            -- Use profiles table
            INSERT INTO profiles (id, tenant_id, email, full_name, role)
            VALUES (NEW.id, _tenant_id, NEW.email, _full_name, 'admin');
            
            -- Check if tenant_settings table exists before inserting
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
