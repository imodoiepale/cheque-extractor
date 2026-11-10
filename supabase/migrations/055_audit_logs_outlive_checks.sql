-- 055: let a cheque be deleted at all.
--
-- The live database has a row-audit trigger on checks (not in these migrations)
-- that writes an audit_logs row, with check_id set, for every INSERT, UPDATE and
-- DELETE. On DELETE that row points at the cheque being removed, so the foreign
-- key on audit_logs.check_id rejected it and every document delete failed with
-- "insert or update on table audit_logs violates foreign key constraint".
-- 054's ON DELETE SET NULL could not help: the row is written during the delete.
--
-- An audit row has to outlive what it describes, so the column stops being a
-- foreign key. It keeps the cheque's id (as does entity_id), which is a better
-- trail than the NULL that 054 left behind.
--
-- Idempotent: every foreign key on the column is looked up and dropped.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.conrelid = 'public.audit_logs'::regclass AND a.attname = 'check_id'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- The same shape one step later: usage_ledger.job_id was ON DELETE SET NULL
-- (027), but the ledger's append-only trigger rejects every UPDATE that touches
-- anything except the two Stripe columns. Removing the check_jobs row therefore
-- failed for any document that had been billed, after its cheques were already
-- gone. The ledger keeps the job id as plain text and outlives the document.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.conrelid = 'public.usage_ledger'::regclass AND a.attname = 'job_id'
  LOOP
    EXECUTE format('ALTER TABLE public.usage_ledger DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
