import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * QuickBooks Pull Checks API
 * 
 * Pulls cheque-related data from QuickBooks Online.
 * 
 * QBO entities relevant to cheques:
 * 
 * 1. Purchase (PaymentType=Check) — Writing a cheque to pay a vendor directly
 *    Endpoint: /v3/company/{realmId}/query?query=SELECT * FROM Purchase WHERE PaymentType='Check'
 * 
 * 2. BillPayment (PayType=Check) — Paying an existing bill by cheque
 *    Endpoint: /v3/company/{realmId}/query?query=SELECT * FROM BillPayment WHERE PayType='Check'
 * 
 * 3. Payment (PaymentMethodRef) — Receiving a cheque from a customer
 *    Endpoint: /v3/company/{realmId}/query?query=SELECT * FROM Payment
 *    (filter client-side for cheque payment method)
 * 
 * 4. Deposit — Bank deposits that may include cheques
 *    Endpoint: /v3/company/{realmId}/query?query=SELECT * FROM Deposit
 */

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
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    const newTokens = await response.json();

    // Update tokens in database
    await supabase
      .from('integrations')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'quickbooks');

    return newTokens.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

async function qboQuery(accessToken: string, realmId: string, query: string, useSandbox = false): Promise<any> {
  const base = useSandbox ? QBO_SANDBOX : QBO_BASE;
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QBO query failed (${response.status}): ${text}`);
  }

  return response.json();
}

function normalizePurchaseCheck(purchase: any): any {
  return {
    id: `purchase-${purchase.Id}`,
    qb_type: 'Purchase',
    qb_source: 'cheque_written',
    check_number: purchase.DocNumber || '',
    date: purchase.TxnDate || '',
    amount: purchase.TotalAmt?.toString() || '0',
    payee: purchase.EntityRef?.name || '',
    account: purchase.AccountRef?.name || '',
    memo: purchase.PrivateNote || '',
    currency: purchase.CurrencyRef?.value || 'USD',
    raw: purchase,
  };
}

function normalizeBillPaymentCheck(bp: any): any {
  return {
    id: `billpayment-${bp.Id}`,
    qb_type: 'BillPayment',
    qb_source: 'bill_paid_by_cheque',
    check_number: bp.DocNumber || bp.CheckPayment?.PrintStatus || '',
    date: bp.TxnDate || '',
    amount: bp.TotalAmt?.toString() || '0',
    payee: bp.VendorRef?.name || '',
    account: bp.CheckPayment?.BankAccountRef?.name || bp.APAccountRef?.name || '',
    memo: bp.PrivateNote || '',
    currency: bp.CurrencyRef?.value || 'USD',
    raw: bp,
  };
}

function normalizePaymentCheck(payment: any): any {
  return {
    id: `payment-${payment.Id}`,
    qb_type: 'Payment',
    qb_source: 'cheque_received',
    check_number: payment.PaymentRefNum || '',
    date: payment.TxnDate || '',
    amount: payment.TotalAmt?.toString() || '0',
    payee: payment.CustomerRef?.name || '',
    account: payment.DepositToAccountRef?.name || 'Undeposited Funds',
    memo: payment.PrivateNote || '',
    currency: payment.CurrencyRef?.value || 'USD',
    raw: payment,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get stored tokens
    const tokens = await getTokens(supabase);
    if (!tokens) {
      return res.status(401).json({
        error: 'QuickBooks not connected',
        message: 'Please connect to QuickBooks in Settings → Integrations first.',
      });
    }

    // Check if token is expired and refresh if needed
    let accessToken = tokens.access_token;
    if (new Date(tokens.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(supabase, tokens);
      if (!refreshed) {
        return res.status(401).json({
          error: 'Token expired',
          message: 'QuickBooks token expired. Please reconnect in Settings.',
        });
      }
      accessToken = refreshed;
    }

    const realmId = tokens.realm_id;
    const useSandbox = req.query.sandbox === 'true';

    // Optional date filters
    const startDate = (req.query.startDate || req.body?.startDate) as string | undefined;
    const endDate = (req.query.endDate || req.body?.endDate) as string | undefined;
    const dateFilter = startDate && endDate
      ? ` AND TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`
      : startDate
        ? ` AND TxnDate >= '${startDate}'`
        : '';

    const allEntries: any[] = [];
    const errors: string[] = [];

    // ── 1. Purchase (PaymentType=Check) — Cheques written to vendors ──
    try {
      const purchaseQuery = `SELECT * FROM Purchase WHERE PaymentType = 'Check'${dateFilter} MAXRESULTS 1000`;
      const purchaseData = await qboQuery(accessToken, realmId, purchaseQuery, useSandbox);
      const purchases = purchaseData?.QueryResponse?.Purchase || [];
      purchases.forEach((p: any) => allEntries.push(normalizePurchaseCheck(p)));
    } catch (e: any) {
      errors.push(`Purchase query failed: ${e.message}`);
    }

    // ── 2. BillPayment (PayType=Check) — Bills paid by cheque ──
    try {
      const bpQuery = `SELECT * FROM BillPayment WHERE PayType = 'Check'${dateFilter} MAXRESULTS 1000`;
      const bpData = await qboQuery(accessToken, realmId, bpQuery, useSandbox);
      const billPayments = bpData?.QueryResponse?.BillPayment || [];
      billPayments.forEach((bp: any) => allEntries.push(normalizeBillPaymentCheck(bp)));
    } catch (e: any) {
      errors.push(`BillPayment query failed: ${e.message}`);
    }

    // ── 3. Payment — Cheques received from customers ──
    try {
      const paymentQuery = `SELECT * FROM Payment${dateFilter ? ' WHERE 1=1' + dateFilter : ''} MAXRESULTS 1000`;
      const paymentData = await qboQuery(accessToken, realmId, paymentQuery, useSandbox);
      const payments = paymentData?.QueryResponse?.Payment || [];
      // Filter for cheque payments (PaymentMethodRef with name containing 'check' or 'cheque')
      const chequePayments = payments.filter((p: any) => {
        const methodName = (p.PaymentMethodRef?.name || '').toLowerCase();
        return methodName.includes('check') || methodName.includes('cheque');
      });
      chequePayments.forEach((p: any) => allEntries.push(normalizePaymentCheck(p)));
    } catch (e: any) {
      errors.push(`Payment query failed: ${e.message}`);
    }

    // Sort by date descending
    allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Optionally store in Supabase for the comparison page
    if (req.method === 'POST' && req.body?.store === true) {
      try {
        // Upsert entries into a qb_entries table
        const { error: storeError } = await supabase
          .from('qb_entries')
          .upsert(
            allEntries.map(e => ({
              id: e.id,
              qb_type: e.qb_type,
              qb_source: e.qb_source,
              check_number: e.check_number,
              date: e.date,
              amount: e.amount,
              payee: e.payee,
              account: e.account,
              memo: e.memo,
              raw_data: e.raw,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'id' }
          );

        if (storeError) {
          errors.push(`Storage failed: ${storeError.message}`);
        }
      } catch (e: any) {
        errors.push(`Storage error: ${e.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      entries: allEntries,
      count: allEntries.length,
      breakdown: {
        cheques_written: allEntries.filter(e => e.qb_source === 'cheque_written').length,
        bills_paid_by_cheque: allEntries.filter(e => e.qb_source === 'bill_paid_by_cheque').length,
        cheques_received: allEntries.filter(e => e.qb_source === 'cheque_received').length,
      },
      errors: errors.length > 0 ? errors : undefined,
      synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Pull checks error:', error);
    return res.status(500).json({ error: error.message || 'Failed to pull checks from QuickBooks' });
  }
}
