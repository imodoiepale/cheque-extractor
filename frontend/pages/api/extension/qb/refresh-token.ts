// v2
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';
import { applyExtensionCors } from '@/lib/extension-cors';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyExtensionCors(req, res, 'POST')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { connectionId, refreshToken } = req.body;
    if (!connectionId || !refreshToken) {
      return res.status(400).json({ error: 'connectionId and refreshToken are required' });
    }

    // Verify the connection belongs to this user's tenant.
    // Try user_profiles first; fall back to profiles for legacy users.
    let profile: { tenant_id: string } | null = null;
    const { data: upData } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();
    profile = upData;

    if (!profile?.tenant_id) {
      const { data: legacyData } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();
      profile = legacyData;
    }

    if (!profile?.tenant_id) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    // One resolver (lib/qb-token.ts). Deliberate differences kept for this
    // caller: the extension supplies the refresh token itself, pins the
    // connection by id, and always wants a NEW token (force), because it calls
    // this only when it has already decided the one it holds is stale. The
    // resolver still verifies the row belongs to this tenant, trims the
    // credentials, writes to BOTH stores and records health.
    const token = await getQbToken(supabase, {
      connectionId,
      tenantId: profile.tenant_id,
      refreshToken,
      force: true,
    });

    if (!token.ok) {
      if (token.reason === 'not_connected') {
        return res.status(403).json({ error: 'Connection not found or access denied' });
      }
      if (token.reason === 'missing_credentials') {
        return res.status(500).json({ error: 'QuickBooks credentials not configured on server' });
      }
      return res.status(502).json({ error: 'Token refresh failed — reconnect QuickBooks' });
    }

    return res.status(200).json({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
    });
  } catch (error: any) {
    console.error('Extension QB refresh error:', error);
    return res.status(500).json({ error: error.message });
  }
}
