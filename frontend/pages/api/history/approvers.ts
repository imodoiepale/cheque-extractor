import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { isUuid } from '@/lib/batch-helpers';

/**
 * GET /api/history/approvers?ids=uuid,uuid
 *
 * Who approved a batch, by name. History's approver column would otherwise
 * render `batches.approved_by` — a raw uuid, which tells nobody anything.
 *
 * Why a separate call rather than a join in /api/batches: user_profiles SELECT
 * is restricted to `id = auth.uid()` (migration 010, to avoid the RLS
 * recursion it was written to fix), so neither the caller's own client nor a
 * PostgREST embed can read a teammate's row. The same workaround the team
 * endpoints use applies — the service client with an explicit
 * `.eq('tenant_id', ...)`, and the capability gate below as the authorisation.
 *
 * `checks.view`, not `team.view`: a plain User reads History, and a History
 * page that cannot name the approver for a User is a worse product than one
 * that can. Only id, name and email are returned, and only for members of the
 * caller's own firm — ids from another tenant simply do not come back.
 */
const MAX_IDS = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'checks.view');
  if (!ctx) return;

  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(isUuid)
    .slice(0, MAX_IDS);

  if (ids.length === 0) return res.status(200).json({ approvers: {} });

  const { data, error } = await createServiceClient()
    .from('user_profiles')
    .select('id, full_name, email')
    .eq('tenant_id', ctx.tenantId)
    .in('id', ids);

  if (error) {
    return res.status(500).json({ error: 'read_failed', message: error.message });
  }

  const approvers: Record<string, { name: string | null; email: string | null }> = {};
  for (const row of data || []) {
    approvers[row.id] = { name: row.full_name ?? null, email: row.email ?? null };
  }
  return res.status(200).json({ approvers });
}
