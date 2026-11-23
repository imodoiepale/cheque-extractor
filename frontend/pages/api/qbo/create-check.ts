import { requireCapability, READ_METHODS } from '@/lib/match-helpers';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';
import { qbFetch } from '@/lib/qb-http';
import { resolveQbRefs, findEntityRef } from '@/lib/qb-refs';

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';

/**
 * POST /api/qbo/create-check
 * Creates a Purchase (check written) or Deposit (received check) in QuickBooks.
 * Body: { txnType: 'Purchase'|'Deposit', checkNumber, amount, date, payee, memo }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Server-side role gate (lib/roles.ts): the UI hiding the action is not enough.
  if (!READ_METHODS.has(req.method ?? '') && !(await requireCapability(req, res, 'checks.edit'))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createAuthenticatedClient(req);
  // One resolver (lib/qb-token.ts). Deliberate difference kept: a failed
  // refresh still attempts the write with the stored token rather than
  // refusing to create the cheque.
  const token = await getQbToken(supabase);
  if (!token.ok && token.reason === 'not_connected') {
    return res.status(400).json({ error: 'QuickBooks not connected' });
  }
  const conn = token.ok ? token.connection : token.connection!;
  const accessToken = token.ok ? token.accessToken : conn.accessToken;

  const { txnType, checkNumber, amount, date, payee, memo } = req.body;
  if (!txnType || !amount || !date) {
    return res.status(400).json({ error: 'txnType, amount and date are required' });
  }

  const useSandbox = process.env.QB_SANDBOX === 'true';
  const base = useSandbox ? QBO_SANDBOX : QBO_BASE;
  const realmId = conn.realmId;
  const totalAmt = parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;

  let refs;
  try {
    refs = await resolveQbRefs(base, realmId, accessToken, req.body.bankAccount);
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
  const missing = txnType === 'Purchase'
    ? (!refs.bank ? 'a Bank account' : !refs.expense ? 'an Expense account' : null)
    : txnType === 'Deposit'
      ? (!refs.undeposited && !refs.bank ? 'an Undeposited Funds or Bank account' : !refs.income ? 'an Income account' : null)
      : null;
  if (missing) return res.status(400).json({ error: `This QuickBooks company has no ${missing}. Add one in QuickBooks, then retry.` });
  const entity = await findEntityRef(base, realmId, accessToken, txnType === 'Purchase' ? 'Vendor' : 'Customer', payee);

  let payload: any;

  if (txnType === 'Purchase') {
    payload = {
      PaymentType: 'Check',
      AccountRef: refs.bank,
      TxnDate: date,
      DocNumber: checkNumber || '',
      TotalAmt: totalAmt,
      PrivateNote: memo || `[Kyriq] Created from vouched check #${checkNumber}`,
      ...(entity ? { EntityRef: { ...entity, type: 'Vendor' } } : {}),
      Line: [{
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: totalAmt,
        AccountBasedExpenseLineDetail: {
          AccountRef: refs.expense,
          BillableStatus: 'NotBillable',
        },
      }],
    };
  } else if (txnType === 'Deposit') {
    payload = {
      TxnDate: date,
      DocNumber: checkNumber || '',
      TotalAmt: totalAmt,
      DepositToAccountRef: refs.undeposited || refs.bank,
      PrivateNote: memo || `[Kyriq] Created from vouched check #${checkNumber}`,
      Line: [{
        DetailType: 'DepositLineDetail',
        Amount: totalAmt,
        DepositLineDetail: {
          AccountRef: refs.income,
          ...(entity ? { Entity: { Type: 'Customer', EntityRef: entity } } : {}),
        },
      }],
    };
  } else {
    return res.status(400).json({ error: `Unsupported txnType: ${txnType}` });
  }

  const endpoint = txnType === 'Purchase' ? 'purchase' : 'deposit';
  const url = `${base}/v3/company/${realmId}/${endpoint}?minorversion=73`;

  const qbRes = await qbFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await qbRes.text();
  let data: any;
  try { data = JSON.parse(rawBody); } catch { data = { raw: rawBody }; }

  if (!qbRes.ok) {
    const fault = data?.Fault?.Error?.[0];
    const msg = fault?.Detail || fault?.Message || `QB API error (${qbRes.status})`;
    console.error(`create-check QB error (${txnType}):`, msg, rawBody.slice(0, 300));
    return res.status(400).json({ error: msg, qbRaw: data });
  }

  const created = data[txnType === 'Purchase' ? 'Purchase' : 'Deposit'];

  // Save it locally now so the comparison shows it before the next sync.
  // Same id shape as pull-checks, so that sync upserts this row, not a copy.
  if (created?.Id && conn.tenantId) {
    const { error: saveErr } = await supabase.from('qb_entries').upsert({
      id: `${txnType.toLowerCase()}-${created.Id}:${realmId}:${conn.tenantId}`,
      realm_id: realmId,
      tenant_id: conn.tenantId,
      intuit_id: String(created.Id),
      qb_type: txnType,
      qb_source: txnType === 'Purchase' ? 'cheque_written' : 'cheque_received',
      check_number: created.DocNumber || '',
      date: created.TxnDate || date,
      amount: String(created.TotalAmt ?? totalAmt),
      payee: entity?.name || payee || '',
      account: (txnType === 'Purchase' ? refs.bank : refs.undeposited || refs.bank)?.name || '',
      memo: created.PrivateNote || '',
      raw_data: created,
      synced_at: new Date().toISOString(),
    });
    if (saveErr) console.warn('create-check: created in QB but local save failed:', saveErr.message);
  }

  return res.status(200).json({
    success: true,
    qbId: created?.Id,
    txnType,
    docNumber: created?.DocNumber,
    totalAmt: created?.TotalAmt,
  });
}
