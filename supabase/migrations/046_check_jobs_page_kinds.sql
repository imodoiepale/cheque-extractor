-- ============================================================================
-- 046: check_jobs.page_kinds — what each page of an upload is
--
-- doc_kind (044) is one verdict per file. A whole bank statement is both: a
-- transaction table on some pages and cheque images on others, and the client
-- wants "Statement + 227 cheque images", not a single label. The backend now
-- classifies every page at upload-analyze time (backend/page_kinds.py) and
-- stores the list here: a JSON array of 'statement' | 'cheque-images' |
-- 'both' | 'other', one entry per page in page order.
-- Nullable: rows that predate this migration stay NULL. Idempotent.
-- ============================================================================

ALTER TABLE public.check_jobs ADD COLUMN IF NOT EXISTS page_kinds JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_jobs_page_kinds_array'
          AND conrelid = 'public.check_jobs'::regclass
    ) THEN
        ALTER TABLE public.check_jobs
            ADD CONSTRAINT check_jobs_page_kinds_array
            CHECK (page_kinds IS NULL OR jsonb_typeof(page_kinds) = 'array');
    END IF;
END $$;

COMMENT ON COLUMN public.check_jobs.page_kinds IS
    'Per-page kinds in page order: statement | cheque-images | both | other (backend/page_kinds.py). NULL = analysed before migration 046.';
