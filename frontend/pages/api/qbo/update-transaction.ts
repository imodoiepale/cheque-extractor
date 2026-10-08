import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';

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
 * Sparse-updates editable fields on a QB transaction (TxnDate, DocNumber,
 * PrivateNote/memo, and TotalAmt for single-line Purchase entities).
 *
 * Body — accepts EITHER form:
 *   { qbTxnId, fields }                              (legacy — qb_transactions UUID)
 *   { intuitId, qbType, fields }                     (preferred — direct QB id + type)
 *   { qbEntryId, fields }                            (qb_entries composite id like "purchase-123")
 *
 * fields: { txnDate?, docNumber?, memo?, amount? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { qbTxnId, qbEntryId, intuitId: bodyIntuitId, qbType: bodyQbType, fields } = req.body || {};
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields object is required' });

  const { txnDate, docNumber, memo, amount } = fields as {
    txnDate?: string; docNumber?: string; memo?: string; amount?: number | string;
  };
  const amountNum = amount != null && amount !== '' ? Number(amount) : null;
  if (amount != null && (amountNum == null || !isFinite(amountNum) || amountNum <= 0)) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!txnDate && !docNumber && !memo && amountNum == null) {
    return res.status(400).json({ error: 'At least one of txnDate, docNumber, memo, or amount must be provided' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Resolve { txnType, txnId, realmId } from any of the three input shapes.
    let txnType: string | null = null;
    let txnId:   string | null = null;
    let realmId: string | null = null;

    if (bodyIntuitId && bodyQbType) {
      txnType = String(bodyQbType);
      txnId   = String(bodyIntuitId);
      // Realm comes from the active QB connection
      const { data: conn } = await supabase
        .from('qb_connections')
        .select('realm_id')
        .eq('is_active', true)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      realmId = conn?.realm_id || null;
    } else if (qbEntryId) {
      const { data: entry } = await supabase
        .from('qb_entries')
        .select('intuit_id, qb_type, tenant_id')
        .eq('id', qbEntryId)
        .maybeSingle();
      if (!entry?.intuit_id || !entry?.qb_type) {
        return res.status(404).json({ error: 'QB entry not found or missing intuit_id/qb_type' });
      }
      txnType = entry.qb_type;
      txnId   = entry.intuit_id;
      const { data: conn } = await supabase
        .from('qb_connections')
        .select('realm_id')
        .eq('tenant_id', entry.tenant_id)
        .eq('is_active', true)
        .maybeSingle();
      realmId = conn?.realm_id || null;
    } else if (qbTxnId) {
      const { data: qbTxn, error: txnErr } = await supabase
        .from('qb_transactions')
        .select('txn_id, txn_type, realm_id')
        .eq('id', qbTxnId)
        .single();
      if (txnErr || !qbTxn) return res.status(404).json({ error: 'QB transaction not found' });
      txnType = qbTxn.txn_type;
      txnId   = qbTxn.txn_id;
      realmId = qbTxn.realm_id;
    } else {
      return res.status(400).json({ error: 'qbTxnId, qbEntryId, or {intuitId+qbType} is required' });
    }

    if (!txnType || !txnId) return res.status(400).json({ error: 'QB transaction is missing intuit ID or type' });

    // One resolver (lib/qb-token.ts). This route already knows which company
    // the transaction belongs to, so the token is resolved FOR that realm —
    // previously it used whichever connection was active, which is the wrong
    // company's token for any firm with more than one connected. Falls back to
    // the active connection when that realm has no qb_connections row (the
    // legacy single-company case).
    let token = await getQbToken(supabase, realmId ? { realmId } : {});
    if (!token.ok && token.reason === 'not_connected' && realmId) {
      token = await getQbToken(supabase);
    }
    if (!token.ok && token.reason === 'not_connected') {
      return res.status(400).json({ error: 'QuickBooks not connected' });
    }
    const conn = token.ok ? token.connection : token.connection!;
    if (!realmId) realmId = conn.realmId;

    // Deliberate difference kept: a failed refresh still attempts the update
    // with the stored token rather than refusing the edit outright.
    const accessToken = token.ok ? token.accessToken : conn.accessToken;

    const useSandbox = process.env.QB_SANDBOX === 'true';
    const base = useSandbox ? QBO_SANDBOX : QBO_BASE;

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

    // Amount update — Purchase / Check entities have a Line array; we rebuild
    // it scaling each line's Amount proportionally to preserve the original split.
    if (amountNum != null) {
      if (txnType === 'BillPayment') {
        return res.status(400).json({
          error: 'Amount changes on BillPayment are not supported via API. Adjust the linked Bill, then re-pay.',
        });
      }
      const lines: any[] = Array.isArray(entity.Line) ? entity.Line : [];
      if (lines.length === 0) {
        return res.status(400).json({ error: 'Cannot update amount: QB transaction has no Line items.' });
      }
      const currentTotal = Number(entity.TotalAmt) || lines.reduce((s, l) => s + (Number(l.Amount) || 0), 0);
      if (currentTotal <= 0) {
        return res.status(400).json({ error: 'Cannot update amount: original TotalAmt is zero.' });
      }
      const ratio = amountNum / currentTotal;
      payload.Line = lines.map((l) => {
        const next: any = { ...l };
        if (typeof l.Amount === 'number' || (l.Amount != null && !isNaN(Number(l.Amount)))) {
          next.Amount = Number((Number(l.Amount) * ratio).toFixed(2));
        }
        return next;
      });
      // Reconcile rounding: nudge the last line so the sum equals amountNum exactly.
      const sum = payload.Line.reduce((s: number, l: any) => s + (Number(l.Amount) || 0), 0);
      const drift = +(amountNum - sum).toFixed(2);
      if (Math.abs(drift) >= 0.01 && payload.Line.length > 0) {
        const last = payload.Line[payload.Line.length - 1];
        last.Amount = Number(((Number(last.Amount) || 0) + drift).toFixed(2));
      }
      payload.TotalAmt = amountNum;
    }

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

    // Sync the local Supabase rows so the UI reflects the change immediately.
    const txnPatch: Record<string, any> = {};
    if (txnDate)        txnPatch.txn_date   = txnDate;
    if (docNumber)      txnPatch.doc_number = docNumber;
    if (memo)           txnPatch.memo       = memo;
    if (amountNum != null) txnPatch.amount  = amountNum;
    if (qbTxnId) {
      await supabase.from('qb_transactions').update(txnPatch).eq('id', qbTxnId);
    }

    // qb_entries (canonical for matching) — patch by intuit_id + qb_type
    const entryPatch: Record<string, any> = {};
    if (txnDate)        entryPatch.date         = txnDate;
    if (docNumber)      entryPatch.check_number = docNumber;
    if (memo)           entryPatch.memo         = memo;
    if (amountNum != null) entryPatch.amount    = String(amountNum);
    if (Object.keys(entryPatch).length > 0) {
      await supabase
        .from('qb_entries')
        .update(entryPatch)
        .eq('intuit_id', txnId)
        .eq('qb_type', txnType);
    }

    const updatedEntity = writeParsed?.[txnType] || writeParsed?.[Object.keys(writeParsed)[0]] || {};
    return res.status(200).json({
      updated: true,
      fields: { ...txnPatch },
      syncToken: updatedEntity.SyncToken || null,
    });
  } catch (error: any) {
    console.error('update-transaction error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected error' });
  }
}
