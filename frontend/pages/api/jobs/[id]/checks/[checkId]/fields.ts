import { requireCapability, READ_METHODS } from '@/lib/match-helpers';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, createServiceClient } from '@/lib/supabase/api';
import { patchJobCheck, withManualFields } from '@/lib/check-sync';

/**
 * PATCH /api/jobs/[id]/checks/[checkId]/fields
 *
 * Updates fields on a single check stored inside jobs.checks_data JSON.
 * `id`      = job UUID (from jobs.job_id)
 * `checkId` = internal check ID such as "check_0166" (NOT a UUID)
 *
 * Called by the Chrome extension UPDATE_CHECK_FIELDS handler when the
 * user edits check data in the review modal.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Server-side role gate (lib/roles.ts): the UI hiding the action is not enough.
  if (!READ_METHODS.has(req.method ?? '') && !(await requireCapability(req, res, 'checks.edit'))) return;
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: jobId, checkId } = req.query;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (!checkId || typeof checkId !== 'string') {
    return res.status(400).json({ error: 'checkId is required' });
  }

  const { amount, payee, check_date, check_number, memo } = req.body || {};

  // The same edit, as flat columns on the checks table (source 'manual').
  const flatUpdates: Record<string, any> = {};
  if (amount !== undefined)       { flatUpdates.amount       = amount === null || amount === '' ? null : parseFloat(amount); flatUpdates.amount_source = 'manual'; }
  if (payee !== undefined)        { flatUpdates.payee        = payee || null;        flatUpdates.payee_source = 'manual'; }
  if (check_date !== undefined)   { flatUpdates.check_date   = check_date || null;   flatUpdates.check_date_source = 'manual'; }
  if (check_number !== undefined) { flatUpdates.check_number = check_number || null; flatUpdates.check_number_source = 'manual'; }
  if (memo !== undefined)         { flatUpdates.memo         = memo || null; }
  if (Object.keys(flatUpdates).length === 0) {
    return res.status(400).json({ error: 'No fields provided to update' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Service client for writes (RLS silently dropped them); every query is scoped to the
    // caller's tenant by hand, and checks rows by job too, since check_id restarts per job.
    const db = createServiceClient();
    const { data: profile } = await db.from('user_profiles').select('tenant_id').eq('id', user.id).maybeSingle();
    const tenantId: string | undefined = profile?.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'No tenant for this user' });

    // Fetch the job row — try job_id TEXT column first; only attempt integer PK if jobId is purely numeric.
    // IMPORTANT: live DB uses INTEGER primary key. Passing a hex string like "0396c0e1" to
    // .eq('id', ...) causes: "invalid input syntax for type integer" from PostgreSQL.
    let { data: job } = await db
      .from('check_jobs')
      .select('id, job_id, checks_data')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!job && /^\d+$/.test(jobId)) {
      const { data: jobById, error: jobByIdErr } = await db
        .from('check_jobs')
        .select('id, job_id, checks_data')
        .eq('id', parseInt(jobId, 10))
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (jobByIdErr) return res.status(500).json({ error: jobByIdErr.message });
      job = jobById;
    }

    if (!job) return res.status(404).json({ error: `Job "${jobId}" not found` });

    // check_jobs only has checks_data (no 'checks' column)
    const checksData: any[] = Array.isArray(job.checks_data)
      ? job.checks_data
      : (typeof job.checks_data === 'string' ? JSON.parse(job.checks_data || '[]') : []);

    if (!checksData.some((c: any) => c.check_id === checkId || c.id === checkId)) {
      return res.status(404).json({ error: `Check "${checkId}" not found in job` });
    }

    // The edit goes inside check.extraction. patchJobCheck retries when another
    // save lands first, so an approval made at the same moment isn't undone.
    const saved = await patchJobCheck(db, tenantId, job.job_id, checkId, (c) => withManualFields(c, {
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      payee,
      checkDate: check_date,
      checkNumber: check_number,
      memo,
    }));
    if (!saved) {
      console.error('Failed to patch checks_data', { jobId: job.job_id, checkId });
      return res.status(500).json({ error: 'The change could not be saved. Please try again.' });
    }

    // Mirror to the flattened checks table (review page, reconcile, matching read it).
    const { error: flatErr } = await db
      .from('checks')
      .update(flatUpdates)
      .eq('tenant_id', tenantId)
      .eq('job_id', job.job_id)
      .eq('check_id', checkId);
    if (flatErr) console.warn('checks mirror skipped:', flatErr.message);

    // Best-effort audit log — check_id must be UUID; put text check_id + field changes in metadata
    try {
      const editedFields = Object.entries({ amount, payee, check_date, check_number, memo })
        .filter(([, v]) => v !== undefined)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {} as Record<string, string>);
      if (Object.keys(editedFields).length > 0) {
        await db.from('audit_logs').insert({
          tenant_id: tenantId,
          action: 'updated',
          entity_type: 'check',
          user_id: user.id,
          metadata: { check_id: checkId, job_id: jobId, fields: editedFields },
        });
      }
    } catch (_) {
      // Non-critical — don't fail the request
    }

    return res.status(200).json({ success: true, message: 'Check fields updated' });
  } catch (error: any) {
    console.error('PATCH check fields error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update check fields' });
  }
}
