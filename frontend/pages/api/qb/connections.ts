import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

/**
 * GET /api/qb/connections
 * Returns all QB companies connected to this user's tenant
 * Used to populate the company switcher dropdown
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return res.status(400).json({ error: 'No tenant found' });
    }

    const tenantId = profile.tenant_id;

    const { data: connections, error } = await supabase
      .from('qb_connections')
      .select('id, realm_id, company_name, company_logo_url, is_active, connected_at')
      .eq('tenant_id', tenantId)
      .order('connected_at', { ascending: true });

    if (error) return res.status(500).json({ error: 'Failed to fetch connections' });

    // Health status and the cached account count, both best-effort.
    //
    // Neither is selected in the query above on purpose: migration 034 adds
    // qb_connections.status and 036 adds qb_accounts, and a database with
    // either unapplied would 42703 the whole switcher rather than degrade. A
    // separate tolerant read means an unapplied migration costs the status
    // badge, not the company list.
    const statusByRealm = new Map<string, string>();
    try {
      const { data: health } = await supabase
        .from('qb_connections')
        .select('realm_id, status')
        .eq('tenant_id', tenantId);
      for (const row of health || []) {
        if (row?.realm_id && row.status) statusByRealm.set(row.realm_id, row.status);
      }
    } catch { /* column absent — fall back to 'connected' below */ }

    const accountsByRealm = new Map<string, number>();
    try {
      const { data: accts } = await supabase
        .from('qb_accounts')
        .select('realm_id')
        .eq('tenant_id', tenantId);
      for (const row of accts || []) {
        if (row?.realm_id) accountsByRealm.set(row.realm_id, (accountsByRealm.get(row.realm_id) || 0) + 1);
      }
    } catch { /* table absent — the switcher shows no account count */ }

    // Enrich with pending check counts
    const enriched = await Promise.all(
      (connections || []).map(async (conn) => {
        const { count } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('realm_id', conn.realm_id)
          .in('status', ['pending', 'unmatched', 'discrepancy']);

        return {
          id: conn.id,
          realmId: conn.realm_id,
          companyName: conn.company_name,
          logoUrl: conn.company_logo_url,
          isActive: conn.is_active,
          connectedAt: conn.connected_at,
          pendingCount: count || 0,
          // 'connected' is migration 034's own column default, so a row with
          // no recorded health has not failed — it has not been checked.
          status: statusByRealm.get(conn.realm_id) || 'connected',
          accountCount: accountsByRealm.get(conn.realm_id) || 0,
        };
      })
    );

    const active = enriched.find((c) => c.isActive) || null;

    return res.status(200).json({ connections: enriched, activeConnection: active });
  } catch (error: any) {
    console.error('QB connections error:', error);
    return res.status(500).json({ error: error.message });
  }
}
