import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

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
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`;

  console.log('🌐 QBO API call:', url.substring(0, 200) + '...');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('❌ QBO API error:', { status: response.status, body: text.substring(0, 500) });
    throw new Error(`QBO query failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Paginated QBO query — fetches all pages (QB returns max 1000 per page).
 */
async function qboQueryAll(accessToken: string, realmId: string, baseQuery: string, entityKey: string, useSandbox = false): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let startPosition = 1;
  const allResults: any[] = [];

  while (true) {
    const pagedQuery = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
    const data = await qboQuery(accessToken, realmId, pagedQuery, useSandbox);
    const results = data?.QueryResponse?.[entityKey] || [];
    allResults.push(...results);

    console.log(`  📄 Page ${Math.ceil(startPosition / PAGE_SIZE)}: ${results.length} ${entityKey} records`);

    if (results.length < PAGE_SIZE) break; // last page
    startPosition += PAGE_SIZE;
  }

  return allResults;
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
    const supabase = createAuthenticatedClient(req);

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

    // Extract filter parameters from query or body
    const params = req.method === 'POST' ? req.body : req.query;
    
    // Date range filters - ensure YYYY-MM-DD format for QuickBooks
    const rawStartDate = params?.startDate as string | undefined;
    const rawEndDate = params?.endDate as string | undefined;
    
    /**
     * Robust date parser: handles all common formats → YYYY-MM-DD
     * Supported: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, DD/MM/YYYY,
     *            M/D/YYYY, ISO 8601, epoch ms, natural Date strings
     */
    function toQBDate(raw: string | undefined): string | undefined {
      if (!raw || raw.trim() === '') return undefined;
      const s = raw.trim();

      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

      // MM/DD/YYYY or M/D/YYYY
      const slashMDY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMDY) {
        const [, mm, dd, yyyy] = slashMDY;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      }

      // DD-MM-YYYY or DD/MM/YYYY (when day > 12, we know it's DD first)
      const dashDMY = s.match(/^(\d{2})[\-\/](\d{2})[\-\/](\d{4})$/);
      if (dashDMY) {
        const [, a, b, yyyy] = dashDMY;
        const aNum = parseInt(a, 10);
        const bNum = parseInt(b, 10);
        // If first part > 12, it must be day
        if (aNum > 12) return `${yyyy}-${b}-${a}`;
        // If second part > 12, first is month
        if (bNum > 12) return `${yyyy}-${a}-${b}`;
        // Ambiguous — assume MM-DD-YYYY (US convention)
        return `${yyyy}-${a}-${b}`;
      }

      // ISO 8601 with time (strip time portion, use date part directly)
      const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
      if (isoMatch) return isoMatch[1];

      // Epoch milliseconds
      if (/^\d{10,13}$/.test(s)) {
        const d = new Date(parseInt(s.length > 10 ? s : s + '000', 10));
        if (!isNaN(d.getTime())) {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }

      // Fallback: let JS parse, but extract local date parts to avoid TZ shift
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        // Use UTC parts if the string looks like it has no time component
        const hasTime = /[T :]/.test(s);
        if (hasTime) {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        // For date-only strings, JS parses as UTC midnight, so use getUTC*
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }

      console.warn(`⚠️ Could not parse date: "${s}", ignoring filter`);
      return undefined;
    }

    const formattedStartDate = toQBDate(rawStartDate);
    const formattedEndDate = toQBDate(rawEndDate);
    
    console.log('📅 Date filter input:', { rawStartDate, rawEndDate });
    console.log('📅 Date filter parsed:', { formattedStartDate, formattedEndDate });

    const dateFilter = formattedStartDate && formattedEndDate
      ? ` AND TxnDate >= '${formattedStartDate}' AND TxnDate <= '${formattedEndDate}'`
      : formattedStartDate
        ? ` AND TxnDate >= '${formattedStartDate}'`
        : formattedEndDate
          ? ` AND TxnDate <= '${formattedEndDate}'`
          : '';
    
    // Amount range filters
    const minAmount = params?.minAmount ? parseFloat(params.minAmount as string) : undefined;
    const maxAmount = params?.maxAmount ? parseFloat(params.maxAmount as string) : undefined;
    
    // Vendor/Payee filter (partial match)
    const vendorFilter = params?.vendor as string | undefined;
    
    // Account filter
    const accountFilter = params?.account as string | undefined;
    
    // Transaction type filter (cheque_written, bill_paid_by_cheque, cheque_received)
    const typeFilter = params?.type as string | undefined;

    const allEntries: any[] = [];
    const errors: string[] = [];

    // ── 0. Diagnostic: wide-open query if no filters to verify connectivity ──
    if (!dateFilter && !accountFilter && !vendorFilter && !typeFilter) {
      console.log('🔎 No filters applied — running diagnostic wide-open queries');
    }

    // ── 1. Purchase (PaymentType=Check) — Cheques written to vendors ──
    try {
      const purchaseQuery = `SELECT * FROM Purchase WHERE PaymentType = 'Check'${dateFilter}`;
      console.log('🔍 Purchase query:', purchaseQuery);
      const purchases = await qboQueryAll(accessToken, realmId, purchaseQuery, 'Purchase', useSandbox);
      console.log(`✅ Purchases found: ${purchases.length}`);
      if (purchases.length > 0) {
        console.log('  📝 Sample Purchase:', { Id: purchases[0].Id, DocNumber: purchases[0].DocNumber, TxnDate: purchases[0].TxnDate, TotalAmt: purchases[0].TotalAmt });
      }
      purchases.forEach((p: any) => allEntries.push(normalizePurchaseCheck(p)));
    } catch (e: any) {
      console.error('❌ Purchase query error:', e.message);
      errors.push(`Purchase query failed: ${e.message}`);
    }

    // ── 2. BillPayment — Bills paid by cheque (MOST CONTRACTOR CHECKS) ──
    // NOTE: QB doesn't support WHERE PayType in query, must filter client-side
    try {
      const bpDateFilter = dateFilter ? ` WHERE ${dateFilter.replace(/^ AND /, '')}` : '';
      const bpQuery = `SELECT * FROM BillPayment${bpDateFilter}`;
      console.log('🔍 BillPayment query:', bpQuery);
      const allBillPayments = await qboQueryAll(accessToken, realmId, bpQuery, 'BillPayment', useSandbox);
      
      // Filter for Check payments client-side
      const billPayments = allBillPayments.filter((bp: any) => {
        const payType = bp.PayType || bp.CheckPayment?.PayType || '';
        return payType.toLowerCase() === 'check';
      });
      
      console.log(`✅ BillPayments found: ${billPayments.length} checks (out of ${allBillPayments.length} total)`);
      if (billPayments.length > 0) {
        console.log('  📝 Sample BillPayment:', { Id: billPayments[0].Id, DocNumber: billPayments[0].DocNumber, TxnDate: billPayments[0].TxnDate, TotalAmt: billPayments[0].TotalAmt, PayType: billPayments[0].PayType, BankAccount: billPayments[0].CheckPayment?.BankAccountRef?.name });
      }
      billPayments.forEach((bp: any) => allEntries.push(normalizeBillPaymentCheck(bp)));
    } catch (e: any) {
      console.error('❌ BillPayment query error:', e.message);
      errors.push(`BillPayment query failed: ${e.message}`);
    }

    // ── 3. Payment — Cheques received from customers ──
    try {
      // QB query language: WHERE clause needs actual conditions, not 'WHERE 1=1'
      const paymentDateFilter = dateFilter
        ? ` WHERE ${dateFilter.replace(/^ AND /, '')}`
        : '';
      const paymentQuery = `SELECT * FROM Payment${paymentDateFilter}`;
      console.log('🔍 Payment query:', paymentQuery);
      const payments = await qboQueryAll(accessToken, realmId, paymentQuery, 'Payment', useSandbox);
      // Filter for cheque payments client-side (PaymentMethodRef with name containing 'check' or 'cheque')
      const chequePayments = payments.filter((p: any) => {
        const methodName = (p.PaymentMethodRef?.name || '').toLowerCase();
        return methodName.includes('check') || methodName.includes('cheque');
      });
      console.log(`✅ Payments found: ${payments.length}, cheque payments: ${chequePayments.length}`);
      chequePayments.forEach((p: any) => allEntries.push(normalizePaymentCheck(p)));
    } catch (e: any) {
      console.error('❌ Payment query error:', e.message);
      errors.push(`Payment query failed: ${e.message}`);
    }

    console.log(`📊 Total entries before filters: ${allEntries.length}`);
    if (allEntries.length > 0) {
      console.log('  📝 Sample entry:', {
        qb_type: allEntries[0].qb_type,
        check_number: allEntries[0].check_number,
        date: allEntries[0].date,
        amount: allEntries[0].amount,
        payee: allEntries[0].payee,
        account: allEntries[0].account,
      });
    }

    // Apply client-side filters (for fields not supported in QBO queries)
    let filteredEntries = allEntries;
    
    // Filter by amount range
    if (minAmount !== undefined) {
      const beforeCount = filteredEntries.length;
      filteredEntries = filteredEntries.filter(e => parseFloat(e.amount) >= minAmount);
      console.log(`💰 Amount filter (min ${minAmount}): ${beforeCount} → ${filteredEntries.length}`);
    }
    if (maxAmount !== undefined) {
      const beforeCount = filteredEntries.length;
      filteredEntries = filteredEntries.filter(e => parseFloat(e.amount) <= maxAmount);
      console.log(`💰 Amount filter (max ${maxAmount}): ${beforeCount} → ${filteredEntries.length}`);
    }
    
    // Filter by vendor/payee (case-insensitive partial match)
    if (vendorFilter) {
      const beforeCount = filteredEntries.length;
      const vendorLower = vendorFilter.toLowerCase();
      filteredEntries = filteredEntries.filter(e => 
        e.payee?.toLowerCase().includes(vendorLower)
      );
      console.log(`👤 Vendor filter ("${vendorFilter}"): ${beforeCount} → ${filteredEntries.length}`);
    }
    
    // Filter by account (case-insensitive partial match)
    if (accountFilter) {
      const beforeCount = filteredEntries.length;
      const accountLower = accountFilter.toLowerCase();
      
      // Log all unique account values to debug matching
      const uniqueAccounts = [...new Set(filteredEntries.map(e => e.account).filter(Boolean))];
      console.log(`🏦 Account filter requested: "${accountFilter}"`);
      console.log(`🏦 Available accounts in data (${uniqueAccounts.length}):`, uniqueAccounts);
      
      filteredEntries = filteredEntries.filter(e => {
        const match = e.account?.toLowerCase().includes(accountLower);
        if (!match && e.account) {
          console.log(`  ❌ No match: "${e.account}" does not contain "${accountFilter}"`);
        }
        return match;
      });
      console.log(`🏦 Account filter ("${accountFilter}"): ${beforeCount} → ${filteredEntries.length}`);
    }
    
    // Filter by transaction type
    if (typeFilter && typeFilter !== 'all') {
      const beforeCount = filteredEntries.length;
      filteredEntries = filteredEntries.filter(e => e.qb_source === typeFilter);
      console.log(`📋 Type filter ("${typeFilter}"): ${beforeCount} → ${filteredEntries.length}`);
    }
    
    // Sort by date descending
    filteredEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Optionally store in Supabase for the comparison page
    if (req.method === 'POST' && params?.store === true) {
      try {
        // Get user's tenant_id for RLS
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('tenant_id')
          .eq('id', user!.id)
          .single();

        const tenantId = profile?.tenant_id;

        if (!tenantId) {
          errors.push('Storage failed: User has no tenant_id');
        } else {
          // Clear old QB entries for this tenant before storing new ones
          await supabase
            .from('qb_entries')
            .delete()
            .eq('tenant_id', tenantId);
          
          // Insert new entries into qb_entries table with tenant_id
          const { error: storeError } = await supabase
            .from('qb_entries')
            .insert(
              filteredEntries.map(e => ({
                id: e.id,
                tenant_id: tenantId,
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
              }))
            );

          if (storeError) {
            errors.push(`Storage failed: ${storeError.message}`);
          }
        }
      } catch (e: any) {
        errors.push(`Storage error: ${e.message}`);
      }
    }

    console.log(`📊 Total entries after filters: ${filteredEntries.length}`);

    return res.status(200).json({
      success: true,
      entries: filteredEntries,
      count: filteredEntries.length,
      total_before_filters: allEntries.length,
      filters_applied: {
        date_range: formattedStartDate || formattedEndDate ? { startDate: formattedStartDate, endDate: formattedEndDate } : null,
        amount_range: minAmount || maxAmount ? { minAmount, maxAmount } : null,
        vendor: vendorFilter || null,
        account: accountFilter || null,
        type: typeFilter || null,
      },
      breakdown: {
        cheques_written: filteredEntries.filter(e => e.qb_source === 'cheque_written').length,
        bills_paid_by_cheque: filteredEntries.filter(e => e.qb_source === 'bill_paid_by_cheque').length,
        cheques_received: filteredEntries.filter(e => e.qb_source === 'cheque_received').length,
      },
      errors: errors.length > 0 ? errors : undefined,
      synced_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Pull checks error:', error);
    return res.status(500).json({ error: error.message || 'Failed to pull checks from QuickBooks' });
  }
}
