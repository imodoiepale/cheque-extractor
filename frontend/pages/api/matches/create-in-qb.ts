import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm, getValidToken, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/create-in-qb
 * Create a new QB transaction from an unmatched check
 * Body: { checkId: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, userId, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    if (!realmId) return res.status(400).json({ error: 'No active QB connection' });

    const { checkId } = req.body;

    const { data: check } = await supabase
      .from('checks')
      .select('*')
      .eq('id', checkId)
      .single();
    if (!check) return res.status(404).json({ error: 'Check not found' });

    const accessToken = await getValidToken(tenantId, realmId);

    const qbPayload: any = {
      TxnDate: check.check_date,
      DocNumber: check.check_number,
      PrivateNote: check.memo || '',
      TotalAmt: check.amount,
      Line: [{
        Amount: check.amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: 'Uncategorized Expense' },
        },
      }],
      PayType: 'Check',
    };

    if (check.payee) {
      qbPayload.EntityRef = { name: check.payee, type: 'Vendor' };
    }

    const qbRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/check`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ Check: qbPayload }),
      }
    );

    const qbData = await qbRes.json();
    if (!qbRes.ok) {
      return res.status(400).json({ error: 'QB API error', details: qbData });
    }

    const newTxn = qbData.Check;

    // Store the new QB transaction locally
    const { data: savedTxn } = await supabase
      .from('qb_transactions')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        realm_id: realmId,
        txn_id: `check-${newTxn.Id}`,
        txn_type: 'Check',
        txn_date: newTxn.TxnDate,
        payee: check.payee,
        amount: check.amount,
        memo: check.memo,
        doc_number: check.check_number,
      })
      .select()
      .single();

    // Update the match to link to this new transaction
    if (savedTxn) {
      await supabase
        .from('matches')
        .update({
          qb_txn_id: savedTxn.id,
          status: 'approved',
          confidence_score: 100,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          resolution: 'created_in_qb',
        })
        .eq('check_id', checkId);
    }

    return res.status(200).json({ success: true, qbTxnId: newTxn.Id });
  } catch (error: any) {
    console.error('Create in QB error:', error);
    return res.status(500).json({ error: error.message });
  }
}
