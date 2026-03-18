import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm, getValidToken } from '@/lib/match-helpers';
import { runMatching } from '@/lib/matching-algorithm';

/**
 * POST /api/matches/sync-qb
 * Pull latest transactions from QB and re-run matching
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, userId, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    if (!realmId) return res.status(400).json({ error: 'No active QB connection' });

    // 1. Pull transactions from QB API
    const accessToken = await getValidToken(tenantId, realmId);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const queries = [
      { query: `SELECT * FROM Purchase WHERE PaymentType = 'Check' AND TxnDate >= '${dateStr}'`, key: 'Purchase', type: 'Purchase' },
      { query: `SELECT * FROM BillPayment WHERE TxnDate >= '${dateStr}'`, key: 'BillPayment', type: 'BillPayment' },
      { query: `SELECT * FROM Check WHERE TxnDate >= '${dateStr}'`, key: 'Check', type: 'Check' },
    ];

    const allTxns: any[] = [];

    for (const q of queries) {
      try {
        const qbRes = await fetch(
          `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(q.query)}&minorversion=65`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
        );
        if (qbRes.ok) {
          const qbData = await qbRes.json();
          const txns = qbData?.QueryResponse?.[q.key] || [];
          txns.forEach((t: any) => {
            allTxns.push({
              tenant_id: tenantId,
              user_id: userId,
              realm_id: realmId,
              txn_id: `${q.type.toLowerCase()}-${t.Id}`,
              txn_type: q.type,
              txn_date: t.TxnDate,
              payee: t.EntityRef?.name || t.VendorRef?.name || t.CustomerRef?.name || null,
              payee_id: t.EntityRef?.value || t.VendorRef?.value || null,
              amount: t.TotalAmt,
              memo: t.PrivateNote || null,
              doc_number: t.DocNumber || null,
              account: t.AccountRef?.name || t.BankAccountRef?.name || t.CheckPayment?.BankAccountRef?.name || null,
            });
          });
          console.log(`✅ ${q.type}: ${txns.length} records`);
        }
      } catch (err: any) {
        console.warn(`⚠️ ${q.type} query failed:`, err.message);
      }
    }

    // 2. Upsert transactions into our DB
    if (allTxns.length > 0) {
      const { error: upsertErr } = await supabase
        .from('qb_transactions')
        .upsert(allTxns, { onConflict: 'tenant_id,realm_id,txn_id' });

      if (upsertErr) {
        console.warn('⚠️ qb_transactions upsert error:', upsertErr.message);
      }
    }

    // 3. Re-run matching algorithm
    const result = await runMatching(tenantId, userId, realmId);

    return res.status(200).json({ success: true, txnsSynced: allTxns.length, ...result });
  } catch (error: any) {
    console.error('QB sync error:', error);
    return res.status(500).json({ error: 'Sync failed', message: error.message });
  }
}
