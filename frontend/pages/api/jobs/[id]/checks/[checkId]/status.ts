import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { clearQBTransactionServer, type QBClearStatus } from '@/pages/api/qbo/clear-transaction';

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

    // Fetch job — try job_id TEXT column first; only attempt integer PK if jobId is purely numeric.
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

    // When job is not persisted in check_jobs (e.g. Python-only in-memory job), still attempt QB
    // clear (clearQBTransactionServer only needs qb_entries, not check_jobs) and update the
    // flattened checks table by check_id as a fallback persistence layer.
    if (!job) {
      console.warn(`check_jobs row not found for job_id="${jobId}"; attempting QB clear + checks table update only`);

      try {
        const mappedStatus = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null;
        if (mappedStatus) {
          await supabase.from('checks').update({ status: mappedStatus }).eq('check_id', checkId);
        }
      } catch (_) { /* non-critical */ }

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

    const checksCol = 'checks_data';

    const checkIdx = checksData.findIndex(
      (c: any) => c.check_id === checkId || c.id === checkId
    );

    if (checkIdx === -1) {
      return res.status(404).json({ error: `Check "${checkId}" not found in job` });
    }

    const check = { ...checksData[checkIdx], status, updated_at: new Date().toISOString() };
    checksData[checkIdx] = check;

    const { error: patchErr } = await supabase
      .from('check_jobs')
      .update({ [checksCol]: checksData, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (patchErr) {
      console.error('Failed to patch check status:', patchErr);
      return res.status(500).json({ error: patchErr.message });
    }

    // Keep checks table and matches table in sync so the web-app match page
    // reflects the extension's approval without requiring a full re-sync.
    const terminalStatus = ['approved', 'rejected'].includes(status) ? status : null;
    if (terminalStatus) {
      try {
        await supabase
          .from('checks')
          .update({ status: terminalStatus })
          .eq('check_id', checkId);

        // If a matches row exists for this check, approve it too so the web app
        // match page stops showing the "Approve" button.
        const { data: checkRow } = await supabase
          .from('checks')
          .select('id')
          .eq('check_id', checkId)
          .maybeSingle();
        if (checkRow?.id) {
          await supabase
            .from('matches')
            .update({ status: terminalStatus, approved_at: terminalStatus === 'approved' ? new Date().toISOString() : null })
            .eq('check_id', checkRow.id)
            .neq('status', terminalStatus);
        }
      } catch (_) {
        // Non-critical — check_jobs update already succeeded
      }
    }

    // Best-effort audit log — check_id must be UUID; use metadata for text check_id
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: (await supabase.from('user_profiles').select('tenant_id').eq('id', user.id).maybeSingle()).data?.tenant_id,
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
