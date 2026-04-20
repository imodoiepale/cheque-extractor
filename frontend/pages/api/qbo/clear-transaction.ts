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
/** Normalised check extraction fields passed from the status route. */
interface CheckData {
  check_number?: string | null;
  check_date?: string | null;
  amount?: number | string | null;
  payee?: string | null;
  bank_name?: string | null;
  memo?: string | null;
  account_number?: string | null;
  routing_number?: string | null;
}

export type QBClearStatus =
  | 'already_cleared'       // QB GET returned ClearedStatus = Cleared / Reconciled (read-only detection)
  | 'queued_for_reconcile'  // Kyriq PrivateNote stamped; extension overlay will tick Cleared on /app/reconcile
  | 'manual_required'       // Entity type (e.g. BillPayment) that QB overlay cannot auto-tick reliably
  | 'inactive_entity'       // QB error 610: transaction references an inactive vendor/account/employee
  | 'failed'                // QB rejected the PrivateNote stamp (auth, sync token, etc.)
  | 'skipped';              // No QB link / file import / QB not connected

export interface QBClearResult {
  cleared: boolean;             // true only for already_cleared (the API can never *set* it)
  status: QBClearStatus;
  warning?: string;
  qbFault?: any;
  readOnlyClearedStatus?: string | null; // value QB returned on GET, for audit / UI hinting
}

/**
 * QBO IDS API fields that report the cleared state on GET.
 * Per Intuit docs + Satva Solutions research, all of these are READ-ONLY —
 * no sparse update with any of these names will set the flag; QB returns
 * fault 2010 "unsupported property". The real clearing path is the extension
 * content script `chrome-extension/content/qbo-overlay.js` which ticks the
 * Cleared checkbox on /app/reconcile.
 */
const CLEARED_READ_FIELDS = ['ClearedStatus', 'TxnStatus', 'ClearStatus'] as const;

function buildKyriqNote(entity: any, entry: any, checkData: CheckData | null): string {
  const today = new Date().toISOString().split('T')[0];
  const safeField = (v: any): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object' && v.value != null) return String(v.value).trim() || null;
    return null;
  };

  const noteFields: [string, string][] = [];
  const docNum  = entity.DocNumber          || entry.check_number || safeField(checkData?.check_number);
  const txnDate = entity.TxnDate            || entry.date         || safeField(checkData?.check_date);
  const payee   = entity.EntityRef?.name    || entry.payee        || safeField(checkData?.payee);
  const amount  = entity.TotalAmt           ?? entry.amount       ?? checkData?.amount;
  const acct    = entity.AccountRef?.name   || entry.account;

  if (docNum)        noteFields.push(['Check #',  String(docNum)]);
  if (txnDate)       noteFields.push(['Date',     txnDate]);
  if (payee)         noteFields.push(['Payee',    payee]);
  if (amount != null) noteFields.push(['Amount',  `$${parseFloat(String(amount)).toFixed(2)}`]);
  if (acct)          noteFields.push(['Account',  acct]);

  const bankName = safeField(checkData?.bank_name);
  const routingNum = safeField(checkData?.routing_number);
  const acctNum = safeField(checkData?.account_number);
  const memo = safeField(checkData?.memo);

  if (bankName)    noteFields.push(['Bank',    bankName]);
  if (routingNum)  noteFields.push(['Routing', routingNum]);
  if (acctNum)     noteFields.push(['Acct #',  acctNum.length > 4 ? `****${acctNum.slice(-4)}` : acctNum]);
  if (memo)        noteFields.push(['Memo',    memo]);

  const kyriqBlock = [
    `[Kyriq] Verified & Cleared: ${today}`,
    ...noteFields.map(([k, v]) => `${k}: ${v}`),
  ].join('\n');

  const existingNote = (entity.PrivateNote || '')
    .replace(/\n?---\n\[Kyriq\][\s\S]*$/, '')
    .replace(/\[Kyriq\][\s\S]*$/, '')
    .trim();

  return existingNote ? `${existingNote}\n---\n${kyriqBlock}` : kyriqBlock;
}

function readClearedStatus(entity: any): string | null {
  for (const f of CLEARED_READ_FIELDS) {
    const v = entity?.[f];
    if (typeof v === 'string' && v) return v;
  }
  const cp = entity?.CheckPayment;
  if (cp) {
    for (const f of CLEARED_READ_FIELDS) {
      const v = cp[f];
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}

function isAlreadyCleared(entity: any): string | null {
  const v = readClearedStatus(entity);
  return v === 'Cleared' || v === 'Reconciled' ? v : null;
}

/**
 * Per-entity required-fields for sparse updates. QB rejects sparse updates on
 * certain entities (error 2020) unless these refs are echoed back.
 */
function requiredExtras(txnType: string, entity: any): Record<string, any> {
  const extra: Record<string, any> = {};
  if (txnType === 'Purchase')    extra.PaymentType        = entity.PaymentType;
  if (txnType === 'Payment')     extra.CustomerRef        = entity.CustomerRef;
  if (txnType === 'Deposit')     extra.DepositToAccountRef = entity.DepositToAccountRef;
  if (txnType === 'BillPayment') {
    if (entity.VendorRef) extra.VendorRef = entity.VendorRef;
    if (entity.PayType)   extra.PayType   = entity.PayType;
  }
  return extra;
}

async function postSparseUpdate(params: {
  base: string;
  realmId: string;
  txnType: string;
  accessToken: string;
  payload: any;
}): Promise<{ ok: boolean; status: number; body: string; parsed?: any }> {
  const { base, realmId, txnType, accessToken, payload } = params;
  const url = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}?minorversion=73`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(body); } catch {}
  const fault = parsed?.Fault || parsed?.fault;
  return { ok: res.ok && !fault, status: res.status, body, parsed };
}

export async function clearQBTransactionServer(
  supabase: any,
  qbEntryId: string,
  checkData: CheckData | null = null
): Promise<QBClearResult> {
  const { data: entry } = await supabase
    .from('qb_entries')
    .select('intuit_id, qb_type, raw_data, check_number, date, amount, payee, account')
    .eq('id', qbEntryId)
    .maybeSingle();

  if (!entry?.intuit_id || !entry?.qb_type) {
    return { cleared: false, status: 'skipped', warning: 'QB entry not found or missing identifiers' };
  }

  if (entry.qb_type === 'FileImport') {
    return { cleared: false, status: 'skipped', warning: 'File import entry — approval saved in Kyriq. No QB Online record to update.' };
  }

  const tokens = await getTokens(supabase);
  if (!tokens) return { cleared: false, status: 'skipped', warning: 'QuickBooks not connected' };

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

  // ── 1. GET the current entity (needed for SyncToken + required refs + ClearedStatus read) ──
  const readUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}/${txnId}?minorversion=73`;
  const readRes = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!readRes.ok) {
    const text = await readRes.text();
    return { cleared: false, status: 'failed', warning: `QB read failed (${readRes.status}): ${text.slice(0, 200)}` };
  }

  const readData = await readRes.json();
  const entity: any = readData[txnType] || readData[Object.keys(readData)[0]];
  if (!entity) return { cleared: false, status: 'failed', warning: 'Transaction not found in QB response' };

  const readOnlyClearedStatus = readClearedStatus(entity);

  // ── 2. Build the sparse-update payload: PrivateNote + per-entity required refs ──
  // NOTE: ClearedStatus / TxnStatus / ClearStatus are READ-ONLY in the QBO IDS
  // API (Intuit docs + Satva reconciliation write-up). We never attempt to
  // write them here; the actual "C" tick happens via the extension content
  // script `qbo-overlay.js` on /app/reconcile.
  const privateNote = buildKyriqNote(entity, entry, checkData);
  const payload: any = {
    Id: entity.Id,
    SyncToken: entity.SyncToken,
    sparse: true,
    PrivateNote: privateNote,
    ...requiredExtras(txnType, entity),
  };

  const stamp = await postSparseUpdate({ base, realmId, txnType, accessToken, payload });
  if (!stamp.ok) {
    const faultCode = stamp.parsed?.Fault?.Error?.[0]?.code;
    if (faultCode === '610') {
      return {
        cleared: false,
        status: 'inactive_entity',
        warning: 'A linked vendor/account on this QB transaction is inactive. Reactivate it in QuickBooks, then re-approve. (QB error 610)',
        readOnlyClearedStatus,
      };
    }
    return {
      cleared: false,
      status: 'failed',
      warning: `QB PrivateNote stamp failed (${stamp.status}): ${stamp.body.slice(0, 200)}`,
      qbFault: stamp.parsed?.Fault,
      readOnlyClearedStatus,
    };
  }

  // ── 3. Classify outcome using the read-only ClearedStatus field ──
  const already = isAlreadyCleared(entity);
  if (already) {
    return {
      cleared: true,
      status: 'already_cleared',
      warning: `QB already has this transaction marked ${already}.`,
      readOnlyClearedStatus,
    };
  }

  // BillPayment can't be auto-cleared by the overlay reliably (the reconcile
  // page renders them differently). Tell the user to tick it by hand.
  if (txnType === 'BillPayment') {
    return {
      cleared: false,
      status: 'manual_required',
      warning: 'Bill Payment cleared-status cannot be set via the QuickBooks API. Mark it Cleared manually in QB reconciliation.',
      readOnlyClearedStatus,
    };
  }

  return {
    cleared: false,
    status: 'queued_for_reconcile',
    warning: 'Kyriq approval note stamped in QB. Open QuickBooks → Reconcile and click "Auto-Clear Kyriq Approved" to tick the Cleared box.',
    readOnlyClearedStatus,
  };
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
