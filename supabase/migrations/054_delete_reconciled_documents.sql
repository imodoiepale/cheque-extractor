-- 054: let a reconciled document be deleted without losing its audit trail.
--
-- audit_logs.check_id and export_history.job_id were created in 001 with no ON
-- DELETE action, so deleting a cheque that had been approved (audit row) or a
-- document that had been exported (export row) was refused by Postgres. The
-- backend used to hide that refusal and report "deleted"; it now reports it.
-- SET NULL keeps the audit and export rows (who did what, when) and lets the
-- cheque or document go.
--
-- Idempotent: each constraint is looked up by column, dropped, and re-added.

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

  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.conrelid = 'public.export_history'::regclass AND a.attname = 'job_id'
  LOOP
    EXECUTE format('ALTER TABLE public.export_history DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_check_id_fkey
  FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE SET NULL;

ALTER TABLE public.export_history
  ADD CONSTRAINT export_history_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.check_jobs(job_id) ON DELETE SET NULL;
