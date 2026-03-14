import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * Fetch QuickBooks Bank Accounts
 * GET /api/qbo/accounts
 * 
 * Returns list of bank accounts from QuickBooks so users can select
 * which account to reconcile/filter by.
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

    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, realm_id, expires_at, qb_client_id, qb_client_secret')
      .eq('provider', 'quickbooks')
      .single();

    if (!integration?.access_token || !integration?.realm_id) {
      return res.status(400).json({ error: 'QuickBooks not connected' });
    }

    // Refresh token if expired
    let accessToken = integration.access_token;
    if (new Date(integration.expires_at) <= new Date()) {
      const clientId = integration.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
      const clientSecret = integration.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(401).json({ error: 'Cannot refresh token — missing credentials' });
      }

      const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: integration.refresh_token,
        }),
      });

      if (!tokenRes.ok) {
        return res.status(401).json({ error: 'Token refresh failed. Please reconnect.' });
      }

      const newTokens = await tokenRes.json();
      accessToken = newTokens.access_token;

      await supabase
        .from('integrations')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        })
        .eq('provider', 'quickbooks');
    }

    // Query bank accounts from QuickBooks
    const query = encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank'");
    const url = `${QBO_BASE}/v3/company/${integration.realm_id}/query?query=${query}&minorversion=73`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Failed to fetch accounts', detail: errorText });
    }

    const data = await response.json();
    const accounts = (data?.QueryResponse?.Account || []).map((acc: any) => ({
      id: acc.Id,
      name: acc.Name,
      fullName: acc.FullyQualifiedName || acc.Name,
      accountType: acc.AccountType,
      accountSubType: acc.AccountSubType,
      currentBalance: acc.CurrentBalance,
      active: acc.Active,
    }));

    console.log(`✅ Found ${accounts.length} bank accounts`);

    return res.status(200).json({
      accounts,
      count: accounts.length,
      realmId: integration.realm_id,
    });
  } catch (error: any) {
    console.error('❌ Accounts fetch error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
}
