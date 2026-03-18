import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

/**
 * POST /api/qb/switch
 * Switch the active QB company
 * Body: { realmId: string }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { realmId } = req.body;
    if (!realmId) return res.status(400).json({ error: 'realmId is required' });

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

    // Verify this connection belongs to this tenant
    const { data: conn, error: findError } = await supabase
      .from('qb_connections')
      .select('id, company_name, realm_id')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId)
      .single();

    if (findError || !conn) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Deactivate all connections for this tenant
    await supabase
      .from('qb_connections')
      .update({ is_active: false })
      .eq('tenant_id', tenantId);

    // Activate the requested one
    const { error: activateError } = await supabase
      .from('qb_connections')
      .update({ is_active: true })
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId);

    if (activateError) {
      return res.status(500).json({ error: 'Failed to switch company' });
    }

    return res.status(200).json({
      success: true,
      activeConnection: {
        id: conn.id,
        realmId: conn.realm_id,
        companyName: conn.company_name,
      },
    });
  } catch (error: any) {
    console.error('QB switch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
