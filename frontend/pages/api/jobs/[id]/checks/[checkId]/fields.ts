import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

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

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Fetch the job row — try job_id TEXT column first; only attempt integer PK if jobId is purely numeric.
    // IMPORTANT: live DB uses INTEGER primary key. Passing a hex string like "0396c0e1" to
    // .eq('id', ...) causes: "invalid input syntax for type integer" from PostgreSQL.
    let { data: job } = await supabase
      .from('check_jobs')
      .select('id, job_id, checks_data')
      .eq('job_id', jobId)
      .maybeSingle();

    if (!job && /^\d+$/.test(jobId)) {
      const { data: jobById, error: jobByIdErr } = await supabase
        .from('check_jobs')
        .select('id, job_id, checks_data')
        .eq('id', parseInt(jobId, 10))
        .maybeSingle();
      if (jobByIdErr) return res.status(500).json({ error: jobByIdErr.message });
      job = jobById;
    }

    if (!job) {
      // Job not in check_jobs — try to update the flattened checks table flat columns directly
      console.warn(`check_jobs row not found for job_id="${jobId}"; attempting direct checks table update`);
      const flatUpdates: Record<string, any> = {};
      if (amount !== undefined)       flatUpdates.amount       = parseFloat(amount);
      if (payee !== undefined)        flatUpdates.payee        = payee;
      if (check_date !== undefined)   flatUpdates.check_date   = check_date;
      if (check_number !== undefined) flatUpdates.check_number = check_number;
      if (memo !== undefined)         flatUpdates.memo         = memo;

      if (Object.keys(flatUpdates).length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      const { error: flatErr } = await supabase
        .from('checks')
        .update(flatUpdates)
        .eq('check_id', checkId);

      if (flatErr) {
        return res.status(500).json({ error: `Job not in database and checks table update failed: ${flatErr.message}` });
      }
      return res.status(200).json({ success: true, message: 'Check fields updated (via checks table)' });
    }

    // check_jobs only has checks_data (no 'checks' column)
    const checksData: any[] = Array.isArray(job.checks_data)
      ? job.checks_data
      : (typeof job.checks_data === 'string' ? JSON.parse(job.checks_data || '[]') : []);

    const checksCol = 'checks_data';

    const checkIdx = checksData.findIndex(
      (c: any) => c.check_id === checkId || c.id === checkId
    );

    if (checkIdx === -1) {
      return res.status(404).json({ error: `Check "${checkId}" not found in job` });
    }

    // Patch fields inside the extraction object (nested under check.extraction)
    const check = { ...checksData[checkIdx] };
    const ext = { ...(check.extraction || {}) };

    if (amount !== undefined)       { ext.amount       = { value: parseFloat(amount), source: 'manual' }; }
    if (payee !== undefined)        { ext.payee        = { value: payee,              source: 'manual' }; }
    if (check_date !== undefined)   { ext.checkDate    = { value: check_date,         source: 'manual' }; }
    if (check_number !== undefined) { ext.checkNumber  = { value: check_number,       source: 'manual' }; }
    if (memo !== undefined)         { ext.memo         = { value: memo,               source: 'manual' }; }

    check.extraction = ext;
    checksData[checkIdx] = check;

    const { error: patchErr } = await supabase
      .from('check_jobs')
      .update({ [checksCol]: checksData, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (patchErr) {
      console.error('Failed to patch checks_data:', patchErr);
      return res.status(500).json({ error: patchErr.message });
    }

    // Best-effort audit log — check_id must be UUID; put text check_id + field changes in metadata
    try {
      const editedFields = Object.entries({ amount, payee, check_date, check_number, memo })
        .filter(([, v]) => v !== undefined)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {} as Record<string, string>);
      if (Object.keys(editedFields).length > 0) {
        const { data: profile } = await supabase.from('user_profiles').select('tenant_id').eq('id', user.id).maybeSingle();
        await supabase.from('audit_logs').insert({
          tenant_id: profile?.tenant_id,
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
