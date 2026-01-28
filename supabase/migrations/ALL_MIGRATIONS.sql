-- ============================================================================
-- COMPLETE DATABASE SETUP - ALL MIGRATIONS COMBINED
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- 2. CREATE TENANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- ============================================================================
-- 3. CREATE USER PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- ============================================================================
-- 4. CREATE CHECKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- File information
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    
    -- Extracted fields
    check_number TEXT,
    check_number_confidence DECIMAL(3, 2),
    check_number_source TEXT CHECK (check_number_source IN ('ocr', 'ai', 'hybrid', 'manual')),
    
    payee TEXT,
    payee_confidence DECIMAL(3, 2),
    payee_source TEXT CHECK (payee_source IN ('ocr', 'ai', 'hybrid', 'manual')),
    
    amount DECIMAL(12, 2),
    amount_confidence DECIMAL(3, 2),
    amount_source TEXT CHECK (amount_source IN ('ocr', 'ai', 'hybrid', 'manual')),
    
    check_date DATE,
    check_date_confidence DECIMAL(3, 2),
    check_date_source TEXT CHECK (check_date_source IN ('ocr', 'ai', 'hybrid', 'manual')),
    
    bank_name TEXT,
    bank_name_confidence DECIMAL(3, 2),
    bank_name_source TEXT CHECK (bank_name_source IN ('ocr', 'ai', 'hybrid', 'manual')),
    
    routing_number TEXT,
    account_number TEXT,
    memo TEXT,
    
    -- Processing metadata
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'pending_review', 'approved', 'exported', 'error'
    )),
    confidence_summary DECIMAL(3, 2),
    processing_method TEXT CHECK (processing_method IN ('ocr', 'ai', 'hybrid')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    exported_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checks_tenant ON checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_created ON checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_check_number ON checks(check_number);

-- ============================================================================
-- 5. CREATE PROCESSING STAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS processing_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL CHECK (stage_name IN (
        'upload', 'preprocessing', 'segmentation', 'ocr', 'ai_extraction', 
        'hybrid_selection', 'validation', 'review', 'approval', 'export'
    )),
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    progress DECIMAL(3, 2) DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_stages_check ON processing_stages(check_id);
CREATE INDEX IF NOT EXISTS idx_processing_stages_status ON processing_stages(status);

-- ============================================================================
-- 6. CREATE AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    check_id UUID REFERENCES checks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_check ON audit_logs(check_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================================
-- 7. CREATE EXPORT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS export_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    export_type TEXT NOT NULL CHECK (export_type IN ('quickbooks', 'csv', 'json')),
    check_ids UUID[] NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    file_url TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_history_tenant ON export_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON export_history(status);
CREATE INDEX IF NOT EXISTS idx_export_history_created ON export_history(created_at DESC);

-- ============================================================================
-- 8. CREATE QBO CONNECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS qbo_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    realm_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    company_name TEXT,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbo_connections_tenant ON qbo_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qbo_connections_realm ON qbo_connections(realm_id);

-- ============================================================================
-- 9. CREATE ANALYTICS VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW check_processing_stats AS
SELECT 
    tenant_id,
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE status = 'approved') as approved_checks,
    COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
    COUNT(*) FILTER (WHERE status = 'error') as error_checks,
    AVG(confidence_summary) as avg_confidence,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds
FROM checks
GROUP BY tenant_id;

CREATE OR REPLACE VIEW daily_check_volume AS
SELECT 
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as check_count,
    SUM(amount) as total_amount,
    AVG(confidence_summary) as avg_confidence
FROM checks
GROUP BY tenant_id, DATE(created_at)
ORDER BY date DESC;

CREATE OR REPLACE VIEW confidence_distribution AS
SELECT 
    tenant_id,
    CASE 
        WHEN confidence_summary >= 0.9 THEN 'high'
        WHEN confidence_summary >= 0.7 THEN 'medium'
        ELSE 'low'
    END as confidence_level,
    COUNT(*) as check_count
FROM checks
WHERE confidence_summary IS NOT NULL
GROUP BY tenant_id, confidence_level;

-- ============================================================================
-- 10. CREATE ADDITIONAL INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_checks_amount ON checks(amount);
CREATE INDEX IF NOT EXISTS idx_checks_check_date ON checks(check_date);
CREATE INDEX IF NOT EXISTS idx_checks_confidence ON checks(confidence_summary);
CREATE INDEX IF NOT EXISTS idx_checks_payee_trgm ON checks USING gin(payee gin_trgm_ops);

-- ============================================================================
-- 11. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_connections ENABLE ROW LEVEL SECURITY;

-- Tenants policies
CREATE POLICY "Users can view their own tenant"
    ON tenants FOR SELECT
    USING (id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- User profiles policies
CREATE POLICY "Users can view profiles in their tenant"
    ON user_profiles FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- Checks policies
CREATE POLICY "Users can view checks in their tenant"
    ON checks FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert checks in their tenant"
    ON checks FOR INSERT
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update checks in their tenant"
    ON checks FOR UPDATE
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- Processing stages policies
CREATE POLICY "Users can view processing stages for their tenant's checks"
    ON processing_stages FOR SELECT
    USING (check_id IN (SELECT id FROM checks WHERE tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())));

-- Audit logs policies
CREATE POLICY "Users can view audit logs in their tenant"
    ON audit_logs FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- Export history policies
CREATE POLICY "Users can view export history in their tenant"
    ON export_history FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- QBO connections policies
CREATE POLICY "Users can view QBO connections in their tenant"
    ON qbo_connections FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- ============================================================================
-- 12. DATABASE FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (tenant_id, check_id, user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (
        COALESCE(NEW.tenant_id, OLD.tenant_id),
        COALESCE(NEW.id, OLD.id),
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 13. CREATE TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checks_updated_at BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qbo_connections_updated_at BEFORE UPDATE ON qbo_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit log triggers
CREATE TRIGGER audit_checks_changes AFTER INSERT OR UPDATE OR DELETE ON checks
    FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- ============================================================================
-- 14. STORAGE BUCKET SETUP
-- ============================================================================

-- Create storage bucket for check images
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-images', 'check-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload check images to their tenant folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'check-images' AND
        (storage.foldername(name))[1] IN (
            SELECT tenant_id::text FROM user_profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can view check images from their tenant"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'check-images' AND
        (storage.foldername(name))[1] IN (
            SELECT tenant_id::text FROM user_profiles WHERE id = auth.uid()
        )
    );

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
