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

function requiredExtras(txnType: string, entity: any): Record<string, any> {
  const extra: Record<string, any> = {};
  if (txnType === 'Purchase')    extra.PaymentType         = entity.PaymentType;
  if (txnType === 'Payment')     extra.CustomerRef         = entity.CustomerRef;
  if (txnType === 'Deposit')     extra.DepositToAccountRef = entity.DepositToAccountRef;
  if (txnType === 'BillPayment') {
    if (entity.VendorRef) extra.VendorRef = entity.VendorRef;
    if (entity.PayType)   extra.PayType   = entity.PayType;
  }
  return extra;
}

/**
 * PATCH /api/qbo/update-transaction
 *
 * Sparse-updates editable scalar fields on a QB transaction (TxnDate, DocNumber,
 * PrivateNote/memo). Amount and payee changes are out of scope for this endpoint
 * because TotalAmt requires rebuilding Line items and EntityRef requires a vendor
 * lookup flow.
 *
 * Body:
 *   qbTxnId  — UUID in the qb_transactions Supabase table
 *   fields   — { txnDate?: string, docNumber?: string, memo?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { qbTxnId, fields } = req.body || {};
  if (!qbTxnId) return res.status(400).json({ error: 'qbTxnId is required' });
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields object is required' });

  const { txnDate, docNumber, memo } = fields as { txnDate?: string; docNumber?: string; memo?: string };
  if (!txnDate && !docNumber && !memo) {
    return res.status(400).json({ error: 'At least one of txnDate, docNumber, or memo must be provided' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Fetch the QB transaction row for identifiers.
    const { data: qbTxn, error: txnErr } = await supabase
      .from('qb_transactions')
      .select('txn_id, txn_type, realm_id, tenant_id')
      .eq('id', qbTxnId)
      .single();

    if (txnErr || !qbTxn) return res.status(404).json({ error: 'QB transaction not found' });
    if (!qbTxn.txn_id || !qbTxn.txn_type) {
      return res.status(400).json({ error: 'QB transaction is missing intuit ID or type' });
    }

    const tokens = await getTokens(supabase);
    if (!tokens) return res.status(400).json({ error: 'QuickBooks not connected' });

    let accessToken = tokens.access_token;
    const isExpired = tokens.expires_at && new Date(tokens.expires_at) <= new Date(Date.now() + 60_000);
    if (isExpired) {
      const refreshed = await refreshAccessToken(supabase, tokens);
      if (refreshed) accessToken = refreshed;
    }

    const useSandbox = process.env.QB_SANDBOX === 'true';
    const base = useSandbox ? QBO_SANDBOX : QBO_BASE;
    const { txn_type: txnType, txn_id: txnId, realm_id: realmId } = qbTxn;

    // GET current entity to obtain SyncToken and required entity refs.
    const readUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}/${txnId}?minorversion=73`;
    const readRes = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!readRes.ok) {
      const text = await readRes.text();
      return res.status(502).json({ error: `QB read failed (${readRes.status}): ${text.slice(0, 300)}` });
    }

    const readData = await readRes.json();
    const entity: any = readData[txnType] || readData[Object.keys(readData)[0]];
    if (!entity) return res.status(502).json({ error: 'Transaction not found in QB response' });

    // Build sparse update payload with only the requested fields.
    const payload: any = {
      Id: entity.Id,
      SyncToken: entity.SyncToken,
      sparse: true,
      ...requiredExtras(txnType, entity),
    };
    if (txnDate)   payload.TxnDate     = txnDate;
    if (docNumber) payload.DocNumber   = docNumber;
    if (memo)      payload.PrivateNote = memo;

    // POST sparse update to QB IDS.
    const writeUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}?minorversion=73`;
    const writeRes = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const writeBody = await writeRes.text();
    let writeParsed: any;
    try { writeParsed = JSON.parse(writeBody); } catch {}

    const fault = writeParsed?.Fault || writeParsed?.fault;
    if (!writeRes.ok || fault) {
      return res.status(502).json({
        error: `QB update failed (${writeRes.status})`,
        qbFault: fault,
        detail: writeBody.slice(0, 300),
      });
    }

    // Sync the local Supabase row so the UI reflects the change immediately.
    const localPatch: Record<string, any> = {};
    if (txnDate)   localPatch.txn_date  = txnDate;
    if (docNumber) localPatch.doc_number = docNumber;
    if (memo)      localPatch.memo       = memo;
    await supabase.from('qb_transactions').update(localPatch).eq('id', qbTxnId);

    const updatedEntity = writeParsed?.[txnType] || writeParsed?.[Object.keys(writeParsed)[0]] || {};
    return res.status(200).json({
      updated: true,
      fields: localPatch,
      syncToken: updatedEntity.SyncToken || null,
    });
  } catch (error: any) {
    console.error('update-transaction error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}
