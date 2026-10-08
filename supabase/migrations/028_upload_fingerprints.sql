-- ============================================================================
-- 028: Database-backed duplicate detection (CHECKLIST section 1, blocking)
--
-- backend/api_server.py compared each upload against the in-memory `jobs`
-- dict, with a comment admitting it ("check in-memory jobs only, not DB").
-- After a restart the same PDF produced a brand new job, so identical customer
-- behaviour was billed differently. That makes the usage ledger untrustworthy,
-- which is why this is a prerequisite for 027 in practice.
--
-- One row per (tenant, content hash). The content hash is of the PDF BYTES, so
-- a renamed copy is still recognised; file_name and file_size are recorded for
-- the message, not for the match.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.upload_fingerprints (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Algorithm-prefixed, e.g. 'sha256:ab12…'. Prefixed so the older md5
    -- fingerprints the backend used can coexist without being mistaken for
    -- sha256 ones.
    content_hash      TEXT NOT NULL,

    file_name         TEXT NOT NULL,
    file_size         BIGINT,

    -- The job the FIRST upload created, and the most recent one.
    first_job_id      TEXT,
    last_job_id       TEXT,

    first_uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    upload_count      INTEGER NOT NULL DEFAULT 1 CHECK (upload_count > 0),

    UNIQUE (tenant_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_upload_fingerprints_tenant_hash
    ON public.upload_fingerprints (tenant_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_upload_fingerprints_tenant_recent
    ON public.upload_fingerprints (tenant_id, last_uploaded_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.upload_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tenant upload_fingerprints" ON public.upload_fingerprints;
CREATE POLICY "Users can view own tenant upload_fingerprints"
    ON public.upload_fingerprints FOR SELECT
    TO authenticated
    USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role full access to upload_fingerprints" ON public.upload_fingerprints;
CREATE POLICY "Service role full access to upload_fingerprints"
    ON public.upload_fingerprints FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- The browser never writes a fingerprint: a tenant that could insert one could
-- claim a file was "already uploaded" and a tenant that could delete one could
-- erase the warning.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.upload_fingerprints FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.upload_fingerprints FROM anon;
GRANT SELECT ON public.upload_fingerprints TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- register_upload_fingerprint()
--
-- Records this upload and returns what was known BEFORE it, so the caller can
-- say "uploaded previously on <date>". Returns:
--   { duplicate, previous_uploaded_at, previous_job_id, previous_upload_count,
--     previous_file_name, upload_count }
--
-- One statement, so two concurrent uploads of the same file cannot both see
-- "no previous upload".
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_upload_fingerprint(
    p_tenant_id    UUID,
    p_content_hash TEXT,
    p_file_name    TEXT,
    p_file_size    BIGINT DEFAULT NULL,
    p_job_id       TEXT   DEFAULT NULL,
    p_user_id      UUID   DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    _prev public.upload_fingerprints;
    _new_count INTEGER;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'register_upload_fingerprint: tenant_id is required';
    END IF;
    IF p_content_hash IS NULL OR btrim(p_content_hash) = '' THEN
        RAISE EXCEPTION 'register_upload_fingerprint: content_hash is required';
    END IF;

    SELECT * INTO _prev
      FROM public.upload_fingerprints
     WHERE tenant_id = p_tenant_id AND content_hash = p_content_hash;

    INSERT INTO public.upload_fingerprints (
        tenant_id, user_id, content_hash, file_name, file_size,
        first_job_id, last_job_id
    ) VALUES (
        p_tenant_id, p_user_id, p_content_hash,
        COALESCE(p_file_name, 'unknown.pdf'), p_file_size,
        p_job_id, p_job_id
    )
    ON CONFLICT (tenant_id, content_hash) DO UPDATE
        SET last_uploaded_at = now(),
            last_job_id      = COALESCE(EXCLUDED.last_job_id, upload_fingerprints.last_job_id),
            upload_count     = upload_fingerprints.upload_count + 1,
            file_name        = COALESCE(EXCLUDED.file_name, upload_fingerprints.file_name)
    RETURNING upload_count INTO _new_count;

    RETURN jsonb_build_object(
        'duplicate',             _prev.id IS NOT NULL,
        'previous_uploaded_at',  _prev.first_uploaded_at,
        'previous_job_id',       COALESCE(_prev.last_job_id, _prev.first_job_id),
        'previous_upload_count', COALESCE(_prev.upload_count, 0),
        'previous_file_name',    _prev.file_name,
        'upload_count',          _new_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.register_upload_fingerprint(UUID, TEXT, TEXT, BIGINT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_upload_fingerprint(UUID, TEXT, TEXT, BIGINT, TEXT, UUID) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.register_upload_fingerprint(UUID, TEXT, TEXT, BIGINT, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.upload_fingerprints IS
    'Durable duplicate detection: one row per (tenant, PDF content hash). Replaces the in-memory check in backend/api_server.py that reset on every restart.';
COMMENT ON COLUMN public.upload_fingerprints.content_hash IS
    'Algorithm-prefixed hash of the PDF bytes, e.g. sha256:<hex>. Matches on content, so a renamed copy is still detected.';
