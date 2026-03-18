-- ============================================================
-- Migration: QB Multi-Company Switcher + Match Engine
-- Run in Supabase SQL Editor after all previous migrations
-- ============================================================

-- ── QB Connections: one row per QB company per tenant ────────
CREATE TABLE IF NOT EXISTS qb_connections (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  realm_id          TEXT        NOT NULL,
  company_name      TEXT,
  company_logo_url  TEXT,
  access_token      TEXT        NOT NULL,
  refresh_token     TEXT        NOT NULL,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  is_active         BOOLEAN     DEFAULT FALSE,
  connected_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, realm_id)
);

-- Only one active connection per tenant at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_connections_one_active
  ON qb_connections(tenant_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_qb_connections_tenant ON qb_connections(tenant_id);

-- ── QB Transactions: pulled from QuickBooks API per company ──
CREATE TABLE IF NOT EXISTS qb_transactions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  realm_id        TEXT        NOT NULL,

  txn_id          TEXT        NOT NULL,
  txn_type        TEXT,
  txn_date        DATE,
  payee           TEXT,
  payee_id        TEXT,
  amount          NUMERIC(12,2),
  memo            TEXT,
  account         TEXT,
  doc_number      TEXT,

  synced_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, realm_id, txn_id)
);

CREATE INDEX IF NOT EXISTS idx_qb_transactions_tenant_realm ON qb_transactions(tenant_id, realm_id);
CREATE INDEX IF NOT EXISTS idx_qb_transactions_txn_date ON qb_transactions(txn_date);

-- ── Add realm_id to existing checks table ────────────────────
ALTER TABLE public.checks ADD COLUMN IF NOT EXISTS realm_id TEXT;
CREATE INDEX IF NOT EXISTS idx_checks_realm_id ON public.checks(realm_id);

-- ── Matches: check-to-QB-transaction reconciliation ──────────
CREATE TABLE IF NOT EXISTS matches (
  id                  UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id             UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  realm_id            TEXT    NOT NULL,

  check_id            UUID    NOT NULL REFERENCES public.checks(id) ON DELETE CASCADE,
  qb_txn_id           UUID    REFERENCES qb_transactions(id) ON DELETE SET NULL,

  confidence_score    NUMERIC(5,2) DEFAULT 0,
  confidence_reasons  JSONB,

  status              TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','matched','approved','flagged','discrepancy','unmatched','rejected')),

  discrepancy_amount  NUMERIC(12,2),
  discrepancy_type    TEXT,
  discrepancy_notes   TEXT,

  resolution          TEXT,
  resolution_notes    TEXT,
  resolved_by         UUID REFERENCES auth.users(id),
  resolved_at         TIMESTAMPTZ,

  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,

  notes               TEXT,
  flagged_reason      TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(check_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_tenant_realm ON matches(tenant_id, realm_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_check_id ON matches(check_id);
CREATE INDEX IF NOT EXISTS idx_matches_confidence ON matches(confidence_score);

-- ── Match Audit Log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_audit_log (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id    UUID    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id     UUID    REFERENCES auth.users(id),
  action      TEXT    NOT NULL,
  old_status  TEXT,
  new_status  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_audit_log_match ON match_audit_log(match_id);

-- ── Auto-update updated_at triggers ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qb_connections_updated_at ON qb_connections;
CREATE TRIGGER qb_connections_updated_at
  BEFORE UPDATE ON qb_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS matches_updated_at ON matches;
CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE qb_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_audit_log  ENABLE ROW LEVEL SECURITY;

-- qb_connections
DROP POLICY IF EXISTS "Tenant isolation qb_connections select" ON qb_connections;
CREATE POLICY "Tenant isolation qb_connections select"
  ON qb_connections FOR SELECT USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_connections insert" ON qb_connections;
CREATE POLICY "Tenant isolation qb_connections insert"
  ON qb_connections FOR INSERT WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_connections update" ON qb_connections;
CREATE POLICY "Tenant isolation qb_connections update"
  ON qb_connections FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_connections delete" ON qb_connections;
CREATE POLICY "Tenant isolation qb_connections delete"
  ON qb_connections FOR DELETE USING (tenant_id = public.user_tenant_id());

-- Service role bypass for qb_connections
DROP POLICY IF EXISTS "Service role qb_connections" ON qb_connections;
CREATE POLICY "Service role qb_connections"
  ON qb_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- qb_transactions
DROP POLICY IF EXISTS "Tenant isolation qb_transactions select" ON qb_transactions;
CREATE POLICY "Tenant isolation qb_transactions select"
  ON qb_transactions FOR SELECT USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_transactions insert" ON qb_transactions;
CREATE POLICY "Tenant isolation qb_transactions insert"
  ON qb_transactions FOR INSERT WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_transactions update" ON qb_transactions;
CREATE POLICY "Tenant isolation qb_transactions update"
  ON qb_transactions FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation qb_transactions delete" ON qb_transactions;
CREATE POLICY "Tenant isolation qb_transactions delete"
  ON qb_transactions FOR DELETE USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role qb_transactions" ON qb_transactions;
CREATE POLICY "Service role qb_transactions"
  ON qb_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- matches
DROP POLICY IF EXISTS "Tenant isolation matches select" ON matches;
CREATE POLICY "Tenant isolation matches select"
  ON matches FOR SELECT USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation matches insert" ON matches;
CREATE POLICY "Tenant isolation matches insert"
  ON matches FOR INSERT WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation matches update" ON matches;
CREATE POLICY "Tenant isolation matches update"
  ON matches FOR UPDATE
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Tenant isolation matches delete" ON matches;
CREATE POLICY "Tenant isolation matches delete"
  ON matches FOR DELETE USING (tenant_id = public.user_tenant_id());

DROP POLICY IF EXISTS "Service role matches" ON matches;
CREATE POLICY "Service role matches"
  ON matches FOR ALL TO service_role USING (true) WITH CHECK (true);

-- match_audit_log
DROP POLICY IF EXISTS "Tenant isolation match_audit_log select" ON match_audit_log;
CREATE POLICY "Tenant isolation match_audit_log select"
  ON match_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_audit_log.match_id
      AND m.tenant_id = public.user_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Service role match_audit_log" ON match_audit_log;
CREATE POLICY "Service role match_audit_log"
  ON match_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
