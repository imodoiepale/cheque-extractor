import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

/**
 * GET /api/qb/active
 * Returns the currently active QB connection for this tenant
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

    const { data, error } = await supabase
      .from('qb_connections')
      .select('id, realm_id, company_name, company_logo_url')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'No active QB connection' });
    }

    return res.status(200).json({
      id: data.id,
      realmId: data.realm_id,
      companyName: data.company_name,
      logoUrl: data.company_logo_url,
    });
  } catch (error: any) {
    console.error('QB active error:', error);
    return res.status(500).json({ error: error.message });
  }
}
