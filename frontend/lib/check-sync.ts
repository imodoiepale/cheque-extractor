/**
 * A cheque lives in two places: the flattened `checks` table (review page,
 * reconcile, matching) and `check_jobs.checks_data` (dashboard, QB comparisons,
 * the extension, exports). A route that writes one must write the other, or the
 * app and the extension disagree about the same cheque.
 *
 * patchJobCheck applies `mutate` to one cheque inside checks_data. The caller
 * passes a service client, so the job is scoped to tenantId here by hand.
 * Best effort: returns false instead of throwing when the job or cheque is gone.
 *
 * The whole list is written back, so two saves at once used to keep only the
 * last: the extension approves three cheques in parallel and Michael lost four
 * approvals that way (17 Nov). The write now only lands if the row is unchanged
 * since it was read (trg_check_jobs_updated bumps updated_at on every write,
 * the backend's included); otherwise it reads again and re-applies `mutate`.
 */
export async function patchJobCheck(
  db: any,
  tenantId: string,
  jobId: string | null | undefined,
  checkId: string | null | undefined,
  mutate: (check: any) => any,
): Promise<boolean> {
  if (!tenantId || !jobId || !checkId) return false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: job } = await db
      .from('check_jobs')
      .select('id, checks_data, updated_at')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!job) return false;

    // Stored as a JSON string by the backend, as an array by these routes.
    const raw = job.checks_data;
    const checks: any[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw || '[]') : [];
    const idx = checks.findIndex((c) => c?.check_id === checkId || c?.id === checkId);
    if (idx === -1) return false;

    checks[idx] = { ...mutate({ ...checks[idx] }), updated_at: new Date().toISOString() };
    let write = db
      .from('check_jobs')
      .update({ checks_data: checks, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('tenant_id', tenantId);
    write = job.updated_at == null ? write.is('updated_at', null) : write.eq('updated_at', job.updated_at);
    const { data: written, error } = await write.select('id');
    if (error) return false;
    if (written?.length) return true;
    // Another save landed between the read and the write: start over from it.
  }
  return false;
}

/** Set fields inside check.extraction the way the manual editors do. */
export function withManualFields(check: any, fields: Record<string, unknown>) {
  const ext = { ...(check.extraction || {}) };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) ext[key] = { value, source: 'manual' };
  }
  return { ...check, extraction: ext };
}
