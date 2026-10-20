# One script to recreate the database

**Status: not possible from the repo alone. One input from the live database is needed.**

## What was found

`supabase/verify_full_schema.py` replays the migrations into a scratch Postgres (with a minimal
stand-in for Supabase's `auth` and `storage`). Replaying 001 to 046 into an empty database fails.

Root causes, all of the form "the live project had it, no migration creates it":

| Migration | Needs | Missing from the migrations |
|---|---|---|
| 005 | `integrations.user_id`, `qb_entries.user_id` | the columns (004 creates both tables without them) |
| 008, 009, 010 | `public.user_profiles` | the table (001 creates `profiles` instead) |
| 009, 031 | `public.app_settings` | the table |
| 011, 023, 038 | `tenant_id` on tables 009 would have added | follows from the two rows above |
| 013, 025, 027, 028, 029 | `public.user_tenant_id()` | follows from 013 failing on `user_profiles` |
| 021, 024 | `qb_transactions` | follows from 013 failing |
| 034, 037 | `qb_connections` | follows from 013 failing |

A second pass over an already-applied database also fails in 001 and 012 (`CREATE POLICY "service_all"`
without a prior `DROP POLICY IF EXISTS`), so those two are not idempotent either.

Migration 004 had two defects of its own and is fixed in this branch (a guard so it does not alter
`integrations` before it exists, and `DROP POLICY IF EXISTS` before a `CREATE POLICY`).

I deliberately did **not** invent the missing tables and columns to make the replay pass. A script
that passes on guessed structure would not match production, which is worse than no script.

## The fix: a baseline from the live database

Full script = **baseline** (schema-only dump of the live project) + every migration after it.

1. In Supabase, open Project Settings > Database and copy the connection string (the password is in it).
   Keep it out of git and out of chat; set it only in your own shell.
2. Take the dump (the `pg_dump` in Postgres 16 or 17; Supabase runs 17):

   ```bash
   pg_dump --schema-only --no-owner --no-privileges --schema=public "$SUPABASE_DB_URL" > supabase/baseline/baseline.sql
   echo 046 > supabase/baseline/applies_through.txt
   ```

   Use the highest migration that is really applied on live (`select max(version) from supabase_migrations.schema_migrations`, or check for the 044 and 045 columns). Migrations 026 to 036 were
   unapplied as of 7 October; confirm before choosing the number.
3. Build and prove it:

   ```bash
   python supabase/build_full_schema.py
   pip install pgserver "psycopg[binary]"
   python supabase/verify_full_schema.py
   ```

   The verifier runs the script twice into a throwaway database and checks the tables and columns the
   application reads. Exit 0 is the "no errors whatsoever" result.
4. Commit `supabase/baseline/` and `supabase/FULL_SCHEMA.sql`. Regenerate with `--check` in CI so the
   script cannot drift from `supabase/migrations/`.

Dumping the public schema does not include `auth`, `storage` or Supabase's own objects. A new Supabase
project already has them, which is what the script assumes.

## What the verifier does not prove

- That the result matches live byte for byte, only that the baseline plus later migrations apply cleanly
  and the expected objects exist.
- Anything about Supabase Auth, Storage or Realtime services. The verifier stands in for the few objects
  the migrations touch.
- Data. This recreates structure only. Moving data between projects is a separate job (`pg_dump --data-only`).
