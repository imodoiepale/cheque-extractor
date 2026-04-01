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

    // Fetch the job row — try by job_id column first, fall back to id (UUID)
    let { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, job_id, checks_data')
      .eq('job_id', jobId)
      .maybeSingle();

    if (!job) {
      const { data: jobById, error: jobByIdErr } = await supabase
        .from('jobs')
        .select('id, job_id, checks_data')
        .eq('id', jobId)
        .maybeSingle();
      if (jobByIdErr) return res.status(500).json({ error: jobByIdErr.message });
      job = jobById;
    }

    if (!job) return res.status(404).json({ error: 'Job not found' });

    // checks_data is stored as an array; each element has a check_id field
    const checksData: any[] = Array.isArray(job.checks_data)
      ? job.checks_data
      : (typeof job.checks_data === 'string' ? JSON.parse(job.checks_data || '[]') : []);

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
      .from('jobs')
      .update({ checks_data: checksData, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (patchErr) {
      console.error('Failed to patch checks_data:', patchErr);
      return res.status(500).json({ error: patchErr.message });
    }

    // Best-effort: also log to audit_logs if the check has a UUID in a separate checks table
    try {
      const editedFields = Object.entries({ amount, payee, check_date, check_number, memo })
        .filter(([, v]) => v !== undefined)
        .map(([field, value]) => ({ check_id: checkId, job_id: jobId, action: 'updated', field, new_value: String(value), user_id: user.id }));
      if (editedFields.length > 0) {
        await supabase.from('audit_logs').insert(editedFields);
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
