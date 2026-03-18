import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

/**
 * QuickBooks Disconnect Endpoint
 * Revokes QuickBooks connection and clears OAuth tokens
 * PRESERVES credentials (client_id, client_secret, redirect_uri) for reconnection
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);

    // Get current integration to revoke token with Intuit
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, qb_client_id, qb_client_secret')
      .eq('provider', 'quickbooks')
      .single();

    // Revoke token with Intuit (best effort)
    if (integration?.access_token && integration?.qb_client_id && integration?.qb_client_secret) {
      try {
        const auth = Buffer.from(
          `${integration.qb_client_id}:${integration.qb_client_secret}`
        ).toString('base64');

        await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: integration.access_token }),
        });
      } catch (revokeError) {
        console.warn('Token revocation failed (non-critical):', revokeError);
      }
    }

    // Clear stored QB entries for this tenant so stale data doesn't persist
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single();

        if (profile?.tenant_id) {
          const { error: deleteError } = await supabase
            .from('qb_entries')
            .delete()
            .eq('tenant_id', profile.tenant_id);
          
          if (deleteError) {
            console.warn('Failed to clear qb_entries (non-critical):', deleteError);
          } else {
            console.log('✅ Cleared qb_entries for tenant:', profile.tenant_id);
          }
        }
      }
    } catch (clearError) {
      console.warn('Failed to clear qb_entries (non-critical):', clearError);
    }

    // Clear OAuth tokens — keep credentials intact
    const { error } = await supabase
      .from('integrations')
      .update({
        access_token: null,
        refresh_token: null,
        expires_at: null,
        realm_id: null,
        company_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'quickbooks');

    if (error) {
      console.error('Failed to disconnect QuickBooks:', error);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    // ── Also clean qb_connections for multi-company switcher ──
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('tenant_id')
          .eq('id', currentUser.id)
          .single();

        if (userProfile?.tenant_id) {
          // Get the realm_id from the request body, or delete all connections
          const realmId = req.body?.realmId;
          
          if (realmId) {
            // Delete specific connection
            await supabase
              .from('qb_connections')
              .delete()
              .eq('tenant_id', userProfile.tenant_id)
              .eq('realm_id', realmId);
          } else {
            // No specific realm — delete all connections for this tenant
            await supabase
              .from('qb_connections')
              .delete()
              .eq('tenant_id', userProfile.tenant_id);
          }

          // If we deleted the active one, activate the most recent remaining
          const { data: remaining } = await supabase
            .from('qb_connections')
            .select('id')
            .eq('tenant_id', userProfile.tenant_id)
            .order('connected_at', { ascending: false })
            .limit(1);

          if (remaining?.length) {
            await supabase
              .from('qb_connections')
              .update({ is_active: true })
              .eq('id', remaining[0].id);
          }

          console.log('✅ Cleaned qb_connections for multi-company switcher');
        }
      }
    } catch (connErr: any) {
      console.warn('⚠️ qb_connections cleanup failed (non-critical):', connErr.message);
    }

    return res.status(200).json({ success: true, message: 'Disconnected. QB data cleared. Credentials preserved.' });
  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    return res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
}
