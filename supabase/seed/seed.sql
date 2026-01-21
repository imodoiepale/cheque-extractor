-- Seed data for development/testing

-- Create a demo tenant
INSERT INTO tenants (id, name, slug, plan, max_checks_per_month, status)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Demo Company Inc', 'demo-company', 'professional', 1000, 'active')
ON CONFLICT (id) DO NOTHING;

-- Create demo user profile (assumes auth.users exists)
-- INSERT INTO user_profiles (id, tenant_id, full_name, email, role, status)
-- VALUES 
--   ('<user-uuid>', '11111111-1111-1111-1111-111111111111', 'Demo User', 'demo@example.com', 'admin', 'active')
-- ON CONFLICT (id) DO NOTHING;

-- Create sample checks for testing
INSERT INTO checks (
  tenant_id, 
  status, 
  source_file, 
  file_url,
  payee, 
  payee_confidence, 
  payee_source,
  amount, 
  amount_confidence, 
  amount_source,
  check_date, 
  check_date_confidence, 
  check_date_source,
  check_number, 
  check_number_confidence, 
  check_number_source,
  bank_name,
  micr_routing,
  micr_account,
  confidence_summary,
  created_at
)
VALUES 
  -- High confidence check (auto-approved)
  (
    '11111111-1111-1111-1111-111111111111',
    'approved',
    'check_001.pdf',
    'https://storage.example.com/check_001.pdf',
    'ACME Supplies Inc',
    0.95,
    'ai',
    1250.00,
    0.98,
    'ai',
    '2026-01-15',
    0.96,
    'ocr',
    '10452',
    0.99,
    'ocr',
    'Chase Bank',
    '021000021',
    '123456789',
    0.95,
    NOW() - INTERVAL '2 days'
  ),
  
  -- Medium confidence check (review suggested)
  (
    '11111111-1111-1111-1111-111111111111',
    'review_suggested',
    'check_002.pdf',
    'https://storage.example.com/check_002.pdf',
    'John Doe Construction',
    0.82,
    'hybrid',
    3500.50,
    0.89,
    'ai',
    '2026-01-16',
    0.78,
    'ocr',
    '10453',
    0.94,
    'ocr',
    'Bank of America',
    '026009593',
    '987654321',
    0.85,
    NOW() - INTERVAL '1 day'
  ),
  
  -- Low confidence check (review required)
  (
    '11111111-1111-1111-1111-111111111111',
    'review_required',
    'check_003.pdf',
    'https://storage.example.com/check_003.pdf',
    'Jane Smith Services',
    0.65,
    'ocr',
    850.00,
    0.72,
    'hybrid',
    '2026-01-17',
    0.68,
    'ocr',
    '10454',
    0.88,
    'ocr',
    'Wells Fargo',
    '121000248',
    '456789123',
    0.68,
    NOW() - INTERVAL '3 hours'
  );