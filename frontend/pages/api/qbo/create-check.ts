import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';

/**
 * POST /api/qbo/create-check
 * Creates a Purchase (check written) or Deposit (received check) in QuickBooks.
 * Body: { txnType: 'Purchase'|'Deposit', checkNumber, amount, date, payee, memo }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  let payload: any;

  if (txnType === 'Purchase') {
    payload = {
      PaymentType: 'Check',
      AccountRef: { name: 'Checking' },
      TxnDate: date,
      DocNumber: checkNumber || '',
      TotalAmt: totalAmt,
      PrivateNote: memo || `[Kyriq] Created from vouched check #${checkNumber}`,
      ...(payee ? { EntityRef: { name: payee, type: 'Vendor' } } : {}),
      Line: [{
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: totalAmt,
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: 'Uncategorized Expense' },
          BillableStatus: 'NotBillable',
        },
      }],
    };
  } else if (txnType === 'Deposit') {
    payload = {
      TxnDate: date,
      DocNumber: checkNumber || '',
      TotalAmt: totalAmt,
      DepositToAccountRef: { name: 'Undeposited Funds' },
      PrivateNote: memo || `[Kyriq] Created from vouched check #${checkNumber}`,
      Line: [{
        DetailType: 'DepositLineDetail',
        Amount: totalAmt,
        DepositLineDetail: {
          AccountRef: { name: 'Uncategorized Income' },
          ...(payee ? { Entity: { Type: 'Customer', EntityRef: { name: payee } } } : {}),
        },
      }],
    };
  } else {
    return res.status(400).json({ error: `Unsupported txnType: ${txnType}` });
  }

  const endpoint = txnType === 'Purchase' ? 'purchase' : 'deposit';
  const url = `${base}/v3/company/${realmId}/${endpoint}?minorversion=73`;

  const qbRes = await fetch(url, {
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
  return res.status(200).json({
    success: true,
    qbId: created?.Id,
    txnType,
    docNumber: created?.DocNumber,
    totalAmt: created?.TotalAmt,
  });
}
