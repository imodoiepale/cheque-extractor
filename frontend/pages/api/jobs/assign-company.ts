import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm, requireCapability } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';

/**
 * Uploads from before each upload was tied to a company have no realm_id and
 * are hidden from matching (they used to show under every company).
 * Same for QB file-import rows (qb_entries.realm_id = '').
 *   GET  -> { count, qbRows }  untagged uploads / QB rows for this tenant
 *   POST -> assigns all of them to the active company
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST' && !(await requireCapability(req, res, 'checks.edit'))) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, tenantId } = await getAuthContext(req);
    const db = createServiceClient();

    const { data: jobs, error } = await db
      .from('check_jobs')
      .select('job_id')
      .eq('tenant_id', tenantId)
      .is('realm_id', null);
    if (error) return res.status(500).json({ error: 'Failed to read uploads' });
    const jobIds = (jobs || []).map((j: any) => j.job_id);

    const { count: qbRows, error: qbErr } = await db
      .from('qb_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('realm_id', '');
    if (qbErr) return res.status(500).json({ error: 'Failed to read QuickBooks rows' });

    if (req.method === 'GET') return res.status(200).json({ count: jobIds.length, qbRows: qbRows || 0 });

    const realmId = await getActiveRealm(supabase, tenantId);
    if (!realmId) return res.status(400).json({ error: 'No active QuickBooks company' });
    if (qbRows) {
      const { error } = await db
        .from('qb_entries')
        .update({ realm_id: realmId })
        .eq('tenant_id', tenantId)
        .eq('realm_id', '');
      if (error) return res.status(500).json({ error: 'Failed to assign QuickBooks rows' });
    }
    if (!jobIds.length) return res.status(200).json({ assigned: 0, qbRows: qbRows || 0, realmId });

    // Cheques first: if the job update then fails, a retry still finds the jobs.
    const { error: checksErr } = await db
      .from('checks')
      .update({ realm_id: realmId })
      .eq('tenant_id', tenantId)
      .in('job_id', jobIds)
      .is('realm_id', null);
    if (checksErr) return res.status(500).json({ error: 'Failed to assign cheques' });

    const { error: jobsErr } = await db
      .from('check_jobs')
      .update({ realm_id: realmId })
      .eq('tenant_id', tenantId)
      .in('job_id', jobIds)
      .is('realm_id', null);
    if (jobsErr) return res.status(500).json({ error: 'Failed to assign uploads' });

    return res.status(200).json({ assigned: jobIds.length, qbRows: qbRows || 0, realmId });
  } catch (e: any) {
    return res.status(e?.message === 'Not authenticated' ? 401 : 500).json({ error: e?.message || 'Failed' });
  }
}
