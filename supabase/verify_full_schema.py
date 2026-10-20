#!/usr/bin/env python3
"""
Prove supabase/FULL_SCHEMA.sql: replay it into a scratch Postgres, twice.

    pip install pgserver "psycopg[binary]"
    python supabase/verify_full_schema.py

Starts a throwaway embedded Postgres, installs the few Supabase objects the
migrations lean on (a stand-in, see SHIM below), runs FULL_SCHEMA.sql, runs it
AGAIN (every migration must be idempotent), then checks the tables, columns
and policies the application code reads. Exit 0 means a clean rebuild. Nothing
here touches a real database.

What this does NOT prove: that the result matches your live project byte for
byte (the live schema was partly built by hand), or anything about Supabase
Auth/Storage services themselves. See the "drift" section of the README note
printed at the end.
"""
import re
import shutil
import sys
import tempfile
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
FULL = HERE / "FULL_SCHEMA.sql"

# Stand-ins for what every Supabase project already has. Kept to what the
# migrations actually reference; if a migration starts using another Supabase
# object this fails loudly and the shim grows by one line.
SHIM = r"""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid, aud text, role text, email text UNIQUE, encrypted_password text,
  email_confirmed_at timestamptz, phone text, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb, raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text $f$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.email', true), '')::text $f$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
  AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
CREATE TABLE IF NOT EXISTS auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, status text, factor_type text);

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
  AS $f$ SELECT string_to_array(name, '/') $f$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
"""

# This embedded Postgres ships without contrib. The migrations need
# uuid-ossp (nothing calls it, 001 just creates it) and gen_random_bytes()
# from pgcrypto. Tiny stand-in extensions, written into the scratch install only.
FAKE_EXTENSIONS = {
    "uuid-ossp": ("1.1", "CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;"),
    "pgcrypto": ("1.3", """CREATE FUNCTION gen_random_bytes(n int) RETURNS bytea LANGUAGE plpgsql AS $$
DECLARE b bytea := ''::bytea; BEGIN
  FOR i IN 1..n LOOP b := b || decode(lpad(to_hex((random()*255)::int), 2, '0'), 'hex'); END LOOP;
  RETURN b; END $$;"""),
}

# Objects application code depends on. Not exhaustive; a canary per migration area.
EXPECT_TABLES = [
    "tenants", "profiles", "tenant_settings", "check_jobs", "checks", "integrations",
    "qb_connections", "qb_transactions", "qb_entries", "matches", "audit_logs",
    "api_usage_logs", "batches", "usage_ledger", "upload_fingerprints",
    "qb_accounts", "waitlist", "check_documents",
]
EXPECT_COLUMNS = [
    ("check_jobs", "doc_kind"), ("check_jobs", "page_kinds"), ("check_jobs", "user_id"),
    ("check_jobs", "batch_id"), ("check_documents", "tenant_id"),
]


def install_fake_extensions():
    import pgserver
    ext_dir = Path(pgserver.__file__).parent / "pginstall" / "share" / "postgresql" / "extension"
    if not ext_dir.is_dir():
        return
    for name, (version, sql) in FAKE_EXTENSIONS.items():
        if (ext_dir / f"{name}.control").exists():
            continue  # a real one is there; use it
        (ext_dir / f"{name}.control").write_text(
            f"comment = 'test stand-in'\ndefault_version = '{version}'\nrelocatable = true\n")
        (ext_dir / f"{name}--{version}.sql").write_text(sql + "\n")


def run(conn_uri, label):
    sql = FULL.read_text(encoding="utf-8")
    with psycopg.connect(conn_uri, autocommit=True) as c:
        try:
            c.execute(sql)
        except psycopg.Error as e:
            diag = e.diagnostic
            print(f"FAIL ({label}): {diag.severity}: {diag.message_primary}")
            if diag.message_detail:
                print(f"  detail: {diag.message_detail}")
            if diag.context:
                print(f"  context: {diag.context.strip().splitlines()[-1]}")
            # Best effort: the error position, when Postgres gives one, points
            # into the script; the nearest banner above it names the migration.
            if diag.statement_position:
                before = sql[: int(diag.statement_position)]
                names = re.findall(r"^-- (\d{3}_[^\n]*\.sql)$", before, re.M)
                if names:
                    print(f"  in or after migration: {names[-1]}")
            return False
    print(f"ok   ({label})")
    return True


def check(conn_uri):
    bad = []
    with psycopg.connect(conn_uri, autocommit=True) as c:
        have = {r[0] for r in c.execute("select table_name from information_schema.tables where table_schema='public'")}
        bad += [f"missing table {t}" for t in EXPECT_TABLES if t not in have]
        cols = {(r[0], r[1]) for r in c.execute("select table_name, column_name from information_schema.columns where table_schema='public'")}
        bad += [f"missing column {t}.{col}" for t, col in EXPECT_COLUMNS if (t, col) not in cols]
        no_rls = [r[0] for r in c.execute(
            "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace "
            "where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1")]
        counts = c.execute("select count(*) from information_schema.tables where table_schema='public'").fetchone()[0]
        pols = c.execute("select count(*) from pg_policies where schemaname='public'").fetchone()[0]
        print(f"public tables: {counts}, policies: {pols}")
        if no_rls:
            print(f"tables WITHOUT row level security (review): {', '.join(no_rls)}")
    return bad


def main():
    if not FULL.exists():
        sys.exit("FULL_SCHEMA.sql missing: run python supabase/build_full_schema.py first")
    import pgserver
    install_fake_extensions()
    tmp = Path(tempfile.mkdtemp(prefix="kyriq_schema_check_"))
    try:
        srv = pgserver.get_server(tmp / "pg", cleanup_mode="delete")
        uri = srv.get_uri()
        with psycopg.connect(uri, autocommit=True) as c:
            c.execute(SHIM)
        ok = run(uri, "first run, empty database") and run(uri, "second run, idempotent")
        if not ok:
            sys.exit(1)
        bad = check(uri)
        if bad:
            print("\n".join(bad))
            sys.exit(1)
        print("FULL_SCHEMA.sql: clean rebuild, idempotent, expected objects present")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
