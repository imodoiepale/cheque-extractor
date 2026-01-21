-- Processing stages for real-time UI updates
CREATE TABLE processing_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  
  -- Stage information
  stage_name TEXT NOT NULL,
  -- Possible values:
  -- 'ingestion', 'preprocessing', 'segmentation', 'ocr_extraction', 
  -- 'ai_extraction', 'hybrid_selection', 'validation', 'complete'
  
  stage_order INTEGER NOT NULL, -- 1, 2, 3, etc.
  
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending', 'processing', 'complete', 'error', 'skipped'
  
  progress INTEGER DEFAULT 0, -- 0-100
  
  -- Stage-specific data
  stage_data JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  -- preprocessing: {"before_url": "...", "after_url": "...", "transformations": [...]}
  -- segmentation: {"checks_found": 2, "bboxes": [[x,y,w,h], ...]}
  -- extraction: {"ocr": {...}, "ai": {...}, "selected": {...}}
  
  error_message TEXT,
  error_details JSONB,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_processing_stages_check ON processing_stages(check_id);
CREATE INDEX idx_processing_stages_status ON processing_stages(check_id, status);
CREATE INDEX idx_processing_stages_order ON processing_stages(check_id, stage_order);
CREATE INDEX idx_processing_stages_updated ON processing_stages(updated_at DESC);

-- Unique constraint to prevent duplicate stages
CREATE UNIQUE INDEX idx_processing_stages_unique 
  ON processing_stages(check_id, stage_name);

-- Comments
COMMENT ON TABLE processing_stages IS 'Tracks each processing stage for real-time UI updates';
COMMENT ON COLUMN processing_stages.stage_data IS 'Stage-specific results and metadata';
COMMENT ON COLUMN processing_stages.stage_order IS 'Determines display order in UI timeline';