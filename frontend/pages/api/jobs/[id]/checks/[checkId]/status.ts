import { requireCapability, READ_METHODS } from '@/lib/match-helpers';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, createServiceClient } from '@/lib/supabase/api';
import { clearQBTransactionServer, type QBClearStatus } from '@/pages/api/qbo/clear-transaction';
import { patchJobCheck } from '@/lib/check-sync';

type QBSync = { status: QBClearStatus; message?: string; readOnlyClearedStatus?: string | null };

/**
 * PATCH /api/jobs/[id]/checks/[checkId]/status
 *
 * Updates the status field on a single check stored inside jobs.checks / jobs.checks_data JSON.
 * `id`      = job_id string (e.g. "job_abc123") OR jobs.id UUID
 * `checkId` = internal check ID such as "check_0213" (NOT a UUID)
 *
 * Called by the Chrome extension UPDATE_CHECK_STATUS handler (approve / reject / undo).
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

  const { status, qbEntryId, checkData: clientCheckData } = req.body || {};
  if (!status || typeof status !== 'string') {
    return res.status(400).json({ error: 'status is required' });
  }

  const VALID_STATUSES = ['approved', 'rejected', 'pending', 'pending_review', 'processing', 'exported', 'error'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Service client for writes — auth already verified above. RLS on check_jobs / checks /
    // matches silently drops writes from the anon+JWT client, which is why approvals were
    // not persisting on refresh. Because it bypasses RLS, EVERY query below is scoped to the
    // caller's tenant by hand: check_id restarts at check_0001 in every job, so an unscoped
    // write by check_id alone reaches other jobs and other firms.
    const db = createServiceClient();
    const { data: profile } = await db.from('user_profiles').select('tenant_id').eq('id', user.id).maybeSingle();
    const tenantId: string | undefined = profile?.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'No tenant for this user' });

    // Fetch job — try job_id TEXT column first; only attempt integer PK if jobId is purely numeric.
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

    // Job not in this tenant's check_jobs (another firm's, or never persisted): nothing of ours
    // to update. QB clear still runs: clearQBTransactionServer uses the caller's RLS client.
    if (!job) {
      console.warn(`check_jobs row not found for job_id="${jobId}" in tenant; QB clear only`);

      let qbSync: QBSync = { status: 'skipped' };
      if (status === 'approved' && qbEntryId && typeof qbEntryId === 'string') {
        try {
          const clearResult = await clearQBTransactionServer(supabase, qbEntryId, clientCheckData || null);
          qbSync = {
            status: clearResult.status,
            message: clearResult.warning,
            readOnlyClearedStatus: clearResult.readOnlyClearedStatus ?? null,
          };
        } catch (qbErr: any) {
          qbSync = { status: 'failed', message: qbErr.message };
        }
      }
      return res.status(200).json({ success: true, status, message: `Check status updated to "${status}"`, qbSync });
    }

    // check_jobs only has checks_data (no 'checks' column)
    const checksData: any[] = Array.isArray(job.checks_data)
      ? job.checks_data
      : (typeof job.checks_data === 'string' ? JSON.parse(job.checks_data || '[]') : []);

    const check = checksData.find((c: any) => c.check_id === checkId || c.id === checkId);
    if (!check) {
      return res.status(404).json({ error: `Check "${checkId}" not found in job` });
    }

    // Not a plain write-back of the list: the extension approves three cheques
    // at once and that kept only the last one. patchJobCheck retries instead.
    const saved = await patchJobCheck(db, tenantId, job.job_id, checkId, (c) => ({ ...c, status }));
    if (!saved) {
      console.error('Failed to patch check status', { jobId: job.job_id, checkId });
      return res.status(500).json({ error: 'The status could not be saved. Please try again.' });
    }

    // Keep the flattened checks table and matches in sync (every status, including the
    // extension's undo to pending_review) so the web app agrees with the extension.
    // Scoped to this tenant + job: check_id alone is not unique.
    try {
      const { data: checkRow } = await db
        .from('checks')
        .update({ status })
        .eq('tenant_id', tenantId)
        .eq('job_id', job.job_id)
        .eq('check_id', checkId)
        .select('id')
        .maybeSingle();

      if (checkRow?.id) {
        const terminal = ['approved', 'rejected'].includes(status);
        const q = db
          .from('matches')
          .update(terminal
            ? { status, approved_by: status === 'approved' ? user.id : null, approved_at: status === 'approved' ? new Date().toISOString() : null }
            // Undo: same revert value matches/[id]/undo-approval.ts uses for a non-95% match.
            : { status: 'pending', approved_by: null, approved_at: null })
          .eq('tenant_id', tenantId)
          .eq('check_id', checkRow.id);
        await (terminal ? q.neq('status', status) : q.in('status', ['approved', 'rejected']));
      }
    } catch (_) {
      // Non-critical — check_jobs update already succeeded
    }

    // Best-effort audit log — check_id must be UUID; use metadata for text check_id
    try {
      await db.from('audit_logs').insert({
        tenant_id: tenantId,
        action: status,
        entity_type: 'check',
        user_id: user.id,
        metadata: { check_id: checkId, job_id: jobId, field: 'status', new_value: status },
      });
    } catch (_) {
      // Non-critical
    }

    // QB clear — non-blocking: approval already saved; qbSync.status surfaces the real QB outcome
    let qbSync: QBSync = { status: 'skipped' };
    if (status === 'approved' && qbEntryId && typeof qbEntryId === 'string') {
      // Extract OCR fields from the check's extraction data to enrich the QB PrivateNote.
      // safeStr handles { value, confidence } objects, plain strings, numbers, and nulls.
      const safeStr = (f: any): string | null => {
        if (f == null) return null;
        if (typeof f === 'string') return f.trim() || null;
        if (typeof f === 'number') return String(f);
        if (typeof f === 'object' && f.value != null) return String(f.value).trim() || null;
        return null;
      };
      const ext = check?.extraction || {};
      const extractedCheckData = {
        check_number:   safeStr(ext.checkNumber)   ?? clientCheckData?.check_number   ?? null,
        check_date:     safeStr(ext.checkDate)      ?? clientCheckData?.check_date     ?? null,
        amount:         safeStr(ext.amount)         ?? clientCheckData?.amount         ?? null,
        payee:          safeStr(ext.payee)          ?? clientCheckData?.payee          ?? null,
        bank_name:      safeStr(ext.bankName)       ?? clientCheckData?.bank_name      ?? null,
        memo:           safeStr(ext.memo)           ?? clientCheckData?.memo           ?? null,
        account_number: safeStr(ext.accountNumber)  ?? clientCheckData?.account_number ?? null,
        routing_number: safeStr(ext.routingNumber)  ?? clientCheckData?.routing_number ?? null,
      };
      try {
        const clearResult = await clearQBTransactionServer(supabase, qbEntryId, extractedCheckData);
        qbSync = {
          status: clearResult.status,
          message: clearResult.warning,
          readOnlyClearedStatus: clearResult.readOnlyClearedStatus ?? null,
        };
      } catch (qbErr: any) {
        qbSync = { status: 'failed', message: qbErr.message };
      }
    }

    return res.status(200).json({ success: true, status, message: `Check status updated to "${status}"`, qbSync });
  } catch (error: any) {
    console.error('PATCH check status error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update check status' });
  }
}
