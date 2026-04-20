/**
 * GET /api/debug/qb-clear?qbEntryId=<uuid>
 *
 * Diagnostic endpoint — returns raw QBO GET/POST traffic for a single Kyriq
 * qb_entries row. Used to verify the correct property name for the cleared
 * flag per entity type (TxnStatus vs ClearedStatus vs ClearStatus) against a
 * live company before committing to a single name in production.
 *
 * Gated behind env `KYRIQ_DEBUG=1` so it is not exposed in production by
 * default. Returns 404 when the flag is not set.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com';
const CANDIDATES = ['TxnStatus', 'ClearedStatus', 'ClearStatus'] as const;

async function getActiveTokens(supabase: any) {
  const { data } = await supabase
    .from('qb_connections')
    .select('access_token, realm_id, token_expires_at')
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.KYRIQ_DEBUG !== '1') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const qbEntryId = String(req.query.qbEntryId || '');
  const dryRun = req.query.dryRun === '1';
  if (!qbEntryId) return res.status(400).json({ error: 'qbEntryId is required' });

  const log: any[] = [];
  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data: entry } = await supabase
      .from('qb_entries')
      .select('id, intuit_id, qb_type, raw_data, check_number, date, amount, payee, account, tenant_id')
      .eq('id', qbEntryId)
      .maybeSingle();

    log.push({ step: 'entry lookup', found: !!entry, entry });
    if (!entry?.intuit_id || !entry?.qb_type) {
      return res.json({ ok: false, log, error: 'qb_entries row missing intuit_id or qb_type' });
    }

    const tokens = await getActiveTokens(supabase);
    log.push({ step: 'active tokens', realmId: tokens?.realm_id, hasToken: !!tokens?.access_token });
    if (!tokens?.access_token) return res.json({ ok: false, log, error: 'No active QB connection' });

    const useSandbox = process.env.QB_SANDBOX === 'true';
    const base = useSandbox ? QBO_SANDBOX : QBO_BASE;
    const txnType = entry.qb_type;
    const txnId = entry.intuit_id;
    const realmId = tokens.realm_id;

    // ── GET ──
    const getUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}/${txnId}?minorversion=73`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    });
    const getBody = await getRes.text();
    let getParsed: any;
    try { getParsed = JSON.parse(getBody); } catch {}
    const entity = getParsed && (getParsed[txnType] || getParsed[Object.keys(getParsed)[0]]);
    log.push({
      step: 'QB GET',
      url: getUrl,
      status: getRes.status,
      ok: getRes.ok,
      entityKeys: entity ? Object.keys(entity) : null,
      currentClearFields: entity
        ? Object.fromEntries(CANDIDATES.map(f => [f, entity[f]]))
        : null,
      SyncToken: entity?.SyncToken,
      PrivateNoteLen: entity?.PrivateNote?.length || 0,
      bodyPreview: getBody.slice(0, 800),
    });

    if (!entity) return res.json({ ok: false, log, error: 'No entity in QB GET response' });
    if (dryRun) return res.json({ ok: true, dryRun: true, log });

    // ── POST attempts ──
    const writeUrl = `${base}/v3/company/${realmId}/${txnType.toLowerCase()}?minorversion=73`;
    const extra: any = { Id: entity.Id, SyncToken: entity.SyncToken, sparse: true };
    if (txnType === 'Purchase') extra.PaymentType = entity.PaymentType;
    if (txnType === 'Payment')  extra.CustomerRef = entity.CustomerRef;
    if (txnType === 'Deposit')  extra.DepositToAccountRef = entity.DepositToAccountRef;
    if (txnType === 'BillPayment') {
      extra.VendorRef = entity.VendorRef;
      extra.PayType = entity.PayType;
    }

    const attempts: any[] = [];
    for (const field of CANDIDATES) {
      const payload: any = { ...extra };
      if (txnType === 'BillPayment') {
        payload.CheckPayment = { ...entity.CheckPayment, [field]: 'Cleared' };
      } else {
        payload[field] = 'Cleared';
      }
      const r = await fetch(writeUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await r.text();
      let parsed: any; try { parsed = JSON.parse(body); } catch {}
      const respEntity = parsed && (parsed[txnType] || parsed[Object.keys(parsed)[0]]);
      attempts.push({
        field,
        status: r.status,
        ok: r.ok && !parsed?.Fault,
        returnedValue: respEntity?.[field] ?? respEntity?.CheckPayment?.[field],
        fault: parsed?.Fault || null,
        bodyPreview: body.slice(0, 400),
      });
      if (r.ok && !parsed?.Fault) break; // stop on first success
    }
    log.push({ step: 'POST attempts', attempts });

    const readOnlyClearedStatus =
      entity.ClearedStatus ?? entity.TxnStatus ?? entity.ClearStatus ??
      entity.CheckPayment?.ClearedStatus ?? entity.CheckPayment?.TxnStatus ?? entity.CheckPayment?.ClearStatus ?? null;

    return res.json({
      ok: true,
      log,
      summary: {
        txnType,
        txnId,
        realmId,
        readOnlyClearedStatus,
        winningField: attempts.find(a => a.ok)?.field || null,
      },
      note: 'Per Intuit docs + Satva Solutions research (satvasolutions.com/blog/reconciled-transactions-quickbooks-online-api), ClearedStatus / TxnStatus / ClearStatus are READ-ONLY in the QBO IDS API. Expect every POST candidate to return Fault 2010. The real "C" tick is performed by the extension content script qbo-overlay.js on /app/reconcile. This route exists to prove the limitation, not to work around it.',
    });
  } catch (err: any) {
    log.push({ step: 'error', message: err?.message, stack: err?.stack });
    return res.status(200).json({ ok: false, log, error: err?.message });
  }
}
