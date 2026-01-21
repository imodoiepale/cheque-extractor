-- Main checks table
CREATE TABLE checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'uploaded', 
  -- Status values:
  -- 'uploaded' -> 'processing' -> 'processed' -> 'review_required' | 'review_suggested' | 'approved' -> 'exported' | 'rejected'
  
  -- File information
  source_file TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT, -- 'pdf', 'png', 'jpg', 'jpeg'
  page_number INTEGER DEFAULT 1,
  check_index INTEGER DEFAULT 1, -- Index if multiple checks on same page
  
  -- Processed images
  preprocessed_image_url TEXT,
  segmented_image_url TEXT,
  
  -- Extracted fields with confidence scores
  payee TEXT,
  payee_confidence NUMERIC(5,4), -- 0.0000 to 1.0000
  payee_source TEXT, -- 'ocr', 'ai', 'hybrid', 'manual'
  
  amount NUMERIC(12,2),
  amount_confidence NUMERIC(5,4),
  amount_source TEXT,
  
  amount_written TEXT, -- Amount in words
  amount_written_confidence NUMERIC(5,4),
  
  check_date DATE,
  check_date_confidence NUMERIC(5,4),
  check_date_source TEXT,
  
  check_number TEXT,
  check_number_confidence NUMERIC(5,4),
  check_number_source TEXT,
  
  bank_name TEXT,
  bank_name_confidence NUMERIC(5,4),
  bank_name_source TEXT,
  
  -- MICR data
  micr_routing TEXT,
  micr_routing_confidence NUMERIC(5,4),
  
  micr_account TEXT,
  micr_account_confidence NUMERIC(5,4),
  
  micr_serial TEXT,
  micr_serial_confidence NUMERIC(5,4),
  
  micr_raw TEXT, -- Full MICR line
  
  -- Memo/notes
  memo TEXT,
  memo_confidence NUMERIC(5,4),
  
  -- Overall confidence
  confidence_summary NUMERIC(5,4),
  
  -- OCR vs AI comparison data
  ocr_results JSONB, -- Full OCR extraction results
  ai_results JSONB,  -- Full AI extraction results
  
  -- Validation results
  validation_errors JSONB DEFAULT '[]'::jsonb,
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  
  -- Review information
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  
  -- Export information
  exported BOOLEAN DEFAULT FALSE,
  exported_at TIMESTAMP WITH TIME ZONE,
  export_method TEXT, -- 'qbo_api', 'csv', 'manual'
  
  -- QuickBooks sync
  qbo_synced BOOLEAN DEFAULT FALSE,
  qbo_transaction_id TEXT,
  qbo_sync_error TEXT,
  qbo_synced_at TIMESTAMP WITH TIME ZONE,
  
  -- Processing metadata
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  processing_duration_ms INTEGER, -- Milliseconds
  
  -- Currency (for future international support)
  currency TEXT DEFAULT 'USD',
  
  -- Custom fields (extensible)
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_checks_tenant ON checks(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_status ON checks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_check_number ON checks(tenant_id, check_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_amount ON checks(amount) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_date ON checks(check_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_created_at ON checks(created_at DESC);
CREATE INDEX idx_checks_exported ON checks(exported) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_qbo_synced ON checks(qbo_synced) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_confidence ON checks(confidence_summary) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_payee ON checks(tenant_id, payee) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX idx_checks_tenant_status_date ON checks(tenant_id, status, check_date DESC) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_tenant_exported ON checks(tenant_id, exported, created_at DESC) 
  WHERE deleted_at IS NULL;

-- GIN indexes for JSONB fields
CREATE INDEX idx_checks_ocr_results ON checks USING GIN(ocr_results);
CREATE INDEX idx_checks_ai_results ON checks USING GIN(ai_results);
CREATE INDEX idx_checks_validation_errors ON checks USING GIN(validation_errors);
CREATE INDEX idx_checks_custom_fields ON checks USING GIN(custom_fields);

-- Unique constraint for duplicate detection
CREATE UNIQUE INDEX idx_checks_duplicate_prevention 
  ON checks(tenant_id, check_number, amount, check_date) 
  WHERE deleted_at IS NULL AND status NOT IN ('rejected', 'duplicate');

-- Comments
COMMENT ON TABLE checks IS 'Main table storing all check data and extraction results';
COMMENT ON COLUMN checks.confidence_summary IS 'Overall extraction confidence (0.0-1.0)';
COMMENT ON COLUMN checks.ocr_results IS 'Raw OCR extraction: {"payee": {"value": "...", "confidence": 0.95}, ...}';
COMMENT ON COLUMN checks.ai_results IS 'Raw AI extraction: {"payee": {"value": "...", "confidence": 0.93}, ...}';
COMMENT ON COLUMN checks.validation_errors IS 'Array of validation errors: [{"field": "amount", "message": "..."}]';