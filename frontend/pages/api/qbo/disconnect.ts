import { requireCapability, READ_METHODS } from '@/lib/match-helpers';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, createServiceClient, getRequestUser } from '@/lib/supabase/api';
import { qbFetch } from '@/lib/qb-http';

/**
 * QuickBooks Disconnect Endpoint
 * Revokes QuickBooks connection and clears OAuth tokens
 * PRESERVES credentials (client_id, client_secret, redirect_uri) for reconnection
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Server-side role gate (lib/roles.ts): the UI hiding the action is not enough.
  if (!READ_METHODS.has(req.method ?? '') && !(await requireCapability(req, res, 'account.edit'))) return;
  // Intuit's "Disconnect URL" is where QuickBooks sends the USER when they
  // disconnect the app from inside QuickBooks — a browser navigation, GET, and
  // with no guarantee of a Kyriq session cookie. Answering 405 there fails
  // Intuit's review, which exercises it.
  //
  // It deliberately does NOT revoke on GET. A GET that destroys a connection is
  // CSRF-able from any page that can embed a link. Intuit has already severed
  // its side by the time the user lands here, and the scheduled health check
  // marks the connection needs_reconnect, so the honest thing is to land the
  // user somewhere that explains the state.
  if (req.method === 'GET') {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com').replace(/\/$/, '').trim();
    return res.redirect(302, `${appUrl}/settings?tab=integrations&notice=quickbooks_disconnected`);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'No tenant' });

    // With a realmId only that company goes; without one, every company does.
    const realmId: string | undefined = req.body?.realmId || undefined;

    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, realm_id, qb_client_id, qb_client_secret')
      .eq('tenant_id', tenantId)
      .eq('provider', 'quickbooks')
      .maybeSingle();

    let connQuery = supabase
      .from('qb_connections')
      .select('access_token, realm_id')
      .eq('tenant_id', tenantId);
    if (realmId) connQuery = connQuery.eq('realm_id', realmId);
    const { data: doomed } = await connQuery;

    // The legacy row mirrors whichever company was connected last, so it is only
    // revoked and rewritten when that company is the one being removed.
    const legacyIsTarget = !realmId || integration?.realm_id === realmId;

    // Revoke with Intuit (best effort): the removed connections' grants.
    const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;
    const tokens = new Set<string>((doomed || []).map((c: any) => c.access_token).filter(Boolean));
    if (legacyIsTarget && integration?.access_token) tokens.add(integration.access_token);
    // The grant is per QuickBooks company, not per firm: revoking it while
    // another firm still uses the company would disconnect that firm too.
    // RLS hides other firms' rows, so ask with the service role.
    let shared = createServiceClient().from('qb_connections').select('realm_id').neq('tenant_id', tenantId);
    if (realmId) shared = shared.eq('realm_id', realmId);
    else shared = shared.in('realm_id', (doomed || []).map((c: any) => c.realm_id).filter(Boolean));
    const { data: sharedRows } = await shared;
    if (sharedRows?.length) tokens.clear();
    if (clientId && clientSecret) {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      for (const token of tokens) {
        try {
          await qbFetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
        } catch (revokeError) {
          console.warn('Token revocation failed (non-critical):', revokeError);
        }
      }
    }

    // Clear this company's stored entries so stale data doesn't persist (re-pulled on next sync).
    let entriesDelete = supabase.from('qb_entries').delete().eq('tenant_id', tenantId);
    if (realmId) entriesDelete = entriesDelete.eq('realm_id', realmId);
    const { error: deleteError } = await entriesDelete;
    if (deleteError) console.warn('Failed to clear qb_entries (non-critical):', deleteError);

    let delQuery = supabase.from('qb_connections').delete().eq('tenant_id', tenantId);
    if (realmId) delQuery = delQuery.eq('realm_id', realmId);
    const { error: connErr } = await delQuery;
    if (connErr) {
      console.error('Failed to remove qb_connections:', connErr);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    // Keep one company selected, and keep the legacy row pointing at it, so the
    // two token stores never disagree about whether QuickBooks is connected.
    const { data: remaining } = await supabase
      .from('qb_connections')
      .select('id, realm_id, company_name, access_token, refresh_token, token_expires_at, is_active')
      .eq('tenant_id', tenantId)
      .order('connected_at', { ascending: false });
    // A trial block is tied to the company that caused it. Once that company is
    // gone the firm isn't using anyone else's trial; reconnecting it blocks again.
    const service = createServiceClient();
    const { data: tenant } = await service.from('tenants').select('trial_blocked_realm_id').eq('id', tenantId).maybeSingle();
    if (tenant?.trial_blocked_realm_id && !remaining?.some((c: any) => c.realm_id === tenant.trial_blocked_realm_id)) {
      await service
        .from('tenants')
        .update({ trial_blocked_reason: null, trial_blocked_realm_id: null, trial_blocked_at: null })
        .eq('id', tenantId);
    }

    const next = remaining?.find((c: any) => c.is_active) || remaining?.[0] || null;
    if (next && !next.is_active) {
      await supabase.from('qb_connections').update({ is_active: true }).eq('id', next.id);
    }

    if (legacyIsTarget) {
      const { error } = await supabase
        .from('integrations')
        .update({
          access_token: next?.access_token ?? null,
          refresh_token: next?.refresh_token ?? null,
          expires_at: next?.token_expires_at ?? null,
          realm_id: next?.realm_id ?? null,
          company_name: next?.company_name ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('provider', 'quickbooks');
      if (error) {
        console.error('Failed to disconnect QuickBooks:', error);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }
    }

    return res.status(200).json({ success: true, message: 'Disconnected. QB data cleared. Credentials preserved.' });
  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    return res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
}
