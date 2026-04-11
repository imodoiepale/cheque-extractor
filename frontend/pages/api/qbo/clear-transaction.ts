import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';

interface QBTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: string;
  qb_client_id?: string;
  qb_client_secret?: string;
}

async function getTokens(supabase: any): Promise<QBTokens | null> {
  try {
    const { data: activeConn } = await supabase
      .from('qb_connections')
      .select('access_token, refresh_token, realm_id, token_expires_at')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();

    if (activeConn?.access_token && activeConn?.realm_id) {
      const { data: creds } = await supabase
        .from('integrations')
        .select('qb_client_id, qb_client_secret')
        .eq('provider', 'quickbooks')
        .maybeSingle();

      return {
        access_token: activeConn.access_token,
        refresh_token: activeConn.refresh_token,
        realm_id: activeConn.realm_id,
        expires_at: activeConn.token_expires_at,
        qb_client_id: creds?.qb_client_id,
        qb_client_secret: creds?.qb_client_secret,
      };
    }
  } catch (_) {}

  const { data } = await supabase
    .from('integrations')
    .select('access_token, refresh_token, realm_id, expires_at, qb_client_id, qb_client_secret')
    .eq('provider', 'quickbooks')
    .single();

  if (!data?.access_token || !data?.realm_id) return null;
  return data;
}

async function refreshAccessToken(supabase: any, tokens: QBTokens): Promise<string | null> {
  const clientId = tokens.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = tokens.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret || !tokens.refresh_token) return null;

  try {
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    });
    if (!response.ok) return null;
    const newTokens = await response.json();
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
    await supabase
      .from('integrations')
      .update({ access_token: newTokens.access_token, refresh_token: newTokens.refresh_token, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
      .eq('provider', 'quickbooks');
    await supabase
      .from('qb_connections')
      .update({ access_token: newTokens.access_token, refresh_token: newTokens.refresh_token, token_expires_at: newExpiresAt })
      .eq('realm_id', tokens.realm_id);
    return newTokens.access_token;
  } catch {
    return null;
  }
}

/**
 * Mark a single QB transaction as Cleared (C) for bank reconciliation.
 * Uses a sparse update so QB preserves all other fields unchanged.
 *
 * Exported so it can be called directly from other API routes (e.g. status.ts).
 */
export async function clearQBTransactionServer(
  supabase: any,
  qbEntryId: string
): Promise<{ cleared: boolean; warning?: string }> {
  const { data: entry } = await supabase
    .from('qb_entries')
    .select('intuit_id, qb_type, raw_data')
    .eq('id', qbEntryId)
    .maybeSingle();

  if (!entry?.intuit_id || !entry?.qb_type) {
    return { cleared: false, warning: 'QB entry not found or missing identifiers' };
  }

  if (entry.qb_type === 'FileImport') {
    return { cleared: false, warning: 'File import entry — approval saved in Kyriq. No QB Online record to update.' };
  }

  const tokens = await getTokens(supabase);
  if (!tokens) return { cleared: false, warning: 'QuickBooks not connected' };

  let accessToken = tokens.access_token;
  const isExpired = tokens.expires_at && new Date(tokens.expires_at) <= new Date(Date.now() + 60_000);
  if (isExpired) {
    const refreshed = await refreshAccessToken(supabase, tokens);
    if (refreshed) accessToken = refreshed;
  }

  const useSandbox = process.env.QB_SANDBOX === 'true';
  const base = useSandbox ? QBO_SANDBOX : QBO_BASE;
  const txnType = entry.qb_type;
  const txnId = entry.intuit_id;
  const realmId = tokens.realm_id;

  const readUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}/${txnId}?minorversion=65`;
  const readRes = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!readRes.ok) {
    const text = await readRes.text();
    return { cleared: false, warning: `QB read failed (${readRes.status}): ${text.slice(0, 200)}` };
  }

  const readData = await readRes.json();
  const entity: any = readData[txnType] || readData[Object.keys(readData)[0]];
  if (!entity) return { cleared: false, warning: 'Transaction not found in QB response' };

  const clearDate = new Date().toISOString().split('T')[0];
  const isBillPayCheck = txnType === 'BillPayment' && entity.PayType === 'Check';
  const updatePayload: any = {
    Id: entity.Id,
    SyncToken: entity.SyncToken,
    sparse: true,
    PrivateNote: `${entity.PrivateNote || ''}\n[Kyriq] Verified & Cleared ${clearDate}`.trim(),
    ...(isBillPayCheck
      ? { CheckPayment: { ...entity.CheckPayment, ClearStatus: 'Cleared' } }
      : { ClearStatus: 'Cleared' }),
  };

  const writeUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}?minorversion=65`;
  const writeRes = await fetch(writeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  if (!writeRes.ok) {
    const text = await writeRes.text();
    return { cleared: false, warning: `QB clear failed (${writeRes.status}): ${text.slice(0, 200)}` };
  }

  return { cleared: true };
}

/**
 * POST /api/qbo/clear-transaction
 * Body: { qbEntryId: string }
 * Returns: { cleared: boolean, warning?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { qbEntryId } = req.body || {};
  if (!qbEntryId) return res.status(400).json({ error: 'qbEntryId is required' });

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const result = await clearQBTransactionServer(supabase, qbEntryId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('clear-transaction error:', error);
    return res.status(200).json({ cleared: false, warning: error.message || 'Unexpected error' });
  }
}
