-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Profile information
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  
  -- Role and permissions
  role TEXT NOT NULL DEFAULT 'viewer',
  -- 'owner', 'admin', 'reviewer', 'viewer'
  
  permissions JSONB DEFAULT '{}'::jsonb,
  -- Example: {"can_approve": true, "can_export": true, "can_delete": false}
  
  -- User preferences
  preferences JSONB DEFAULT '{}'::jsonb,
  -- Example: {"notifications": true, "auto_approve_threshold": 0.95, "theme": "light"}
  
  -- Activity tracking
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  login_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'invited', 'suspended', 'deleted'
  
  -- Invitation
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMP WITH TIME ZONE,
  invitation_accepted_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_user_profiles_status ON user_profiles(status);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- GIN index for JSONB
CREATE INDEX idx_user_profiles_permissions ON user_profiles USING GIN(permissions);
CREATE INDEX idx_user_profiles_preferences ON user_profiles USING GIN(preferences);

-- Comments
COMMENT ON TABLE user_profiles IS 'Extended user information and tenant association';
COMMENT ON COLUMN user_profiles.role IS 'owner > admin > reviewer > viewer';
COMMENT ON COLUMN user_profiles.permissions IS 'Fine-grained permission overrides';