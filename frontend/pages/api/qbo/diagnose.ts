import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * QuickBooks Diagnostic Endpoint
 * GET /api/qbo/diagnose
 * 
 * Runs wide-open queries with NO filters to verify:
 * 1. Token is valid
 * 2. RealmId is correct (shows company name)
 * 3. What data actually exists in QB
 * 4. Raw JSON response structure for field mapping verification
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  try {
    const supabase = createAuthenticatedClient(req);

    // Steps 1 and 2 are now one call into the single resolver
    // (lib/qb-token.ts): it reads qb_connections first, falls back to the
    // legacy integrations row, trims the credentials, refreshes when stale,
    // writes the new token to both stores and records connection health.
    //
    // Deliberate difference kept: this is a DIAGNOSTIC, so every outcome is
    // REPORTED as a step with HTTP 200 rather than thrown or returned as an
    // error status. That is the whole point of the endpoint.
    const token = await getQbToken(supabase);

    diagnostics.steps.push({
      step: '1_read_connection',
      success: token.connection !== null,
      source: token.connection?.source ?? 'none',
      data: token.connection
        ? {
            hasAccessToken: !!token.connection.accessToken,
            hasRefreshToken: !!token.connection.refreshToken,
            realmId: token.connection.realmId,
            companyName: token.connection.companyName,
            expiresAt: token.connection.expiresAt,
            tokenExpired: !token.ok || token.refreshed,
            hasClientId: !!token.connection.clientId,
            hasClientSecret: !!token.connection.clientSecret,
          }
        : null,
    });

    if (!token.ok && token.reason === 'not_connected') {
      diagnostics.conclusion =
        'FAIL: No valid QB connection found. Check qb_connections (active) and integrations tables.';
      return res.status(200).json(diagnostics);
    }

    if (!token.ok) {
      diagnostics.steps.push({
        step: '2_refresh_token',
        success: false,
        error: `${token.detail} [${token.reason}, health=${token.health}]`,
      });
      diagnostics.conclusion =
        token.reason === 'missing_credentials'
          ? 'FAIL: Token expired and no credentials to refresh'
          : 'FAIL: Token expired and refresh failed. Reconnect to QuickBooks.';
      return res.status(200).json(diagnostics);
    }

    diagnostics.steps.push({
      step: '2_refresh_token',
      success: true,
      message: token.refreshed ? 'Token refreshed successfully' : 'Token still valid, no refresh needed',
    });

    const accessToken = token.accessToken;
    const realmId = token.connection.realmId;

    // Step 3: Verify company info (confirm realmId)
    try {
      const companyRes = await fetch(
        `${QBO_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (companyRes.ok) {
        const companyData = await companyRes.json();
        const ci = companyData.CompanyInfo;
        diagnostics.steps.push({
          step: '3_company_info',
          success: true,
          data: {
            companyName: ci.CompanyName,
            legalName: ci.LegalName,
            country: ci.Country,
            realmId: realmId,
          },
        });
      } else {
        const errText = await companyRes.text();
        diagnostics.steps.push({
          step: '3_company_info',
          success: false,
          error: `CompanyInfo failed (${companyRes.status}): ${errText}`,
        });
      }
    } catch (compErr: any) {
      diagnostics.steps.push({ step: '3_company_info', success: false, error: compErr.message });
    }

    // Helper to run a single QBO query and return results
    async function runDiagQuery(label: string, query: string, entityKey: string) {
      try {
        const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errText = await response.text();
          return {
            step: label,
            query,
            success: false,
            error: `HTTP ${response.status}: ${errText.substring(0, 300)}`,
          };
        }

        const data = await response.json();
        const results = data?.QueryResponse?.[entityKey] || [];
        const totalCount = data?.QueryResponse?.totalCount ?? results.length;

        return {
          step: label,
          query,
          success: true,
          count: results.length,
          totalCount,
          maxResults: data?.QueryResponse?.maxResults,
          sample: results.slice(0, 2).map((r: any) => ({
            Id: r.Id,
            DocNumber: r.DocNumber,
            TxnDate: r.TxnDate,
            TotalAmt: r.TotalAmt,
            PaymentType: r.PaymentType,
            PayType: r.PayType,
            EntityRef: r.EntityRef,
            VendorRef: r.VendorRef,
            AccountRef: r.AccountRef ? { value: r.AccountRef.value, name: r.AccountRef.name } : undefined,
            CheckPayment: r.CheckPayment ? {
              BankAccountRef: r.CheckPayment.BankAccountRef,
            } : undefined,
            PaymentMethodRef: r.PaymentMethodRef,
          })),
          // Show raw first result for field mapping debug
          rawFirst: results.length > 0 ? results[0] : null,
        };
      } catch (queryErr: any) {
        return { step: label, query, success: false, error: queryErr.message };
      }
    }

    // Step 4: Wide-open Purchase query (no date filter, just 5 results)
    diagnostics.steps.push(
      await runDiagQuery(
        '4_purchase_wide_open',
        "SELECT * FROM Purchase WHERE PaymentType = 'Check' MAXRESULTS 5",
        'Purchase'
      )
    );

    // Step 5: BillPayment wide-open (fetch all, filter client-side since WHERE PayType not supported)
    try {
      const bpQuery = `SELECT * FROM BillPayment MAXRESULTS 5`;
      const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(bpQuery)}&minorversion=73`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        diagnostics.steps.push({
          step: '5_billpayment_wide_open',
          query: bpQuery,
          success: false,
          error: `HTTP ${response.status}: ${errText}`,
        });
      } else {
        const data = await response.json();
        const allBillPayments = data?.QueryResponse?.BillPayment || [];
        const checkBillPayments = allBillPayments.filter((bp: any) => {
          const payType = bp.PayType || bp.CheckPayment?.PayType || '';
          return payType.toLowerCase() === 'check';
        });

        diagnostics.steps.push({
          step: '5_billpayment_wide_open',
          query: bpQuery,
          success: true,
          count: checkBillPayments.length,
          totalCount: data?.QueryResponse?.totalCount || allBillPayments.length,
          maxResults: 5,
          sample: checkBillPayments.slice(0, 3).map((bp: any) => ({
            Id: bp.Id,
            DocNumber: bp.DocNumber,
            TxnDate: bp.TxnDate,
            TotalAmt: bp.TotalAmt,
            PayType: bp.PayType,
            VendorRef: bp.VendorRef,
            CheckPayment: bp.CheckPayment,
          })),
          rawFirst: checkBillPayments[0] || null,
        });
      }
    } catch (err: any) {
      diagnostics.steps.push({
        step: '5_billpayment_wide_open',
        query: 'SELECT * FROM BillPayment MAXRESULTS 5',
        success: false,
        error: err.message,
      });
    }

    // Step 6: Wide-open BillPayment WITHOUT PayType filter (to see if there are any BillPayments at all)
    diagnostics.steps.push(
      await runDiagQuery(
        '6_billpayment_all_types',
        "SELECT * FROM BillPayment MAXRESULTS 5",
        'BillPayment'
      )
    );

    // Step 7: Wide-open Purchase WITHOUT PaymentType filter
    diagnostics.steps.push(
      await runDiagQuery(
        '7_purchase_all_types',
        "SELECT * FROM Purchase MAXRESULTS 5",
        'Purchase'
      )
    );

    // Step 8: Payment query (no filters)
    diagnostics.steps.push(
      await runDiagQuery(
        '8_payment_wide_open',
        "SELECT * FROM Payment MAXRESULTS 5",
        'Payment'
      )
    );

    // Step 9: Count queries to see totals
    diagnostics.steps.push(
      await runDiagQuery(
        '9_count_purchase_checks',
        "SELECT COUNT(*) FROM Purchase WHERE PaymentType = 'Check'",
        'Purchase'
      )
    );

    // Step 10: Count all BillPayments (can't filter by PayType in query)
    diagnostics.steps.push(
      await runDiagQuery(
        '10_count_billpayment_all',
        "SELECT COUNT(*) FROM BillPayment",
        'BillPayment'
      )
    );

    // Step 10: Recent data query (last 6 months) to check date range
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const fromDate = sixMonthsAgo.toISOString().split('T')[0];

    diagnostics.steps.push(
      await runDiagQuery(
        '11_recent_purchases',
        `SELECT * FROM Purchase WHERE PaymentType = 'Check' AND TxnDate >= '${fromDate}' MAXRESULTS 5`,
        'Purchase'
      )
    );

    // Step 12: Recent BillPayments (fetch all, will filter PayType client-side in actual pull)
    diagnostics.steps.push(
      await runDiagQuery(
        '12_recent_billpayments',
        `SELECT * FROM BillPayment WHERE TxnDate >= '${fromDate}' MAXRESULTS 5`,
        'BillPayment'
      )
    );

    // Step 13-26: Explore ALL entity types to see where data actually exists
    const entityTypes = [
      { type: 'Purchase', desc: 'Purchase transactions (expenses, checks written)' },
      { type: 'Bill', desc: 'Unpaid bills from vendors' },
      { type: 'Invoice', desc: 'Customer invoices' },
      { type: 'Estimate', desc: 'Customer estimates/quotes' },
      { type: 'SalesReceipt', desc: 'Cash sales receipts' },
      { type: 'Deposit', desc: 'Bank deposits' },
      { type: 'Transfer', desc: 'Transfers between accounts' },
      { type: 'JournalEntry', desc: 'Manual journal entries' },
      { type: 'Vendor', desc: 'Vendor list' },
      { type: 'Customer', desc: 'Customer list' },
      { type: 'Account', desc: 'Chart of accounts' },
      { type: 'Item', desc: 'Products and services' },
      { type: 'Employee', desc: 'Employee list' },
      { type: 'Class', desc: 'Classes for categorization' },
    ];

    const entitiesWithData: any[] = [];
    let stepNum = 13;

    for (const entity of entityTypes) {
      try {
        const countQuery = `SELECT COUNT(*) FROM ${entity.type}`;
        const countUrl = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(countQuery)}&minorversion=73`;
        
        const countRes = await fetch(countUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        let totalCount = 0;
        if (countRes.ok) {
          const countData = await countRes.json();
          totalCount = countData?.QueryResponse?.totalCount || 0;
        }

        diagnostics.steps.push({
          step: `${stepNum}_entity_${entity.type.toLowerCase()}`,
          entityType: entity.type,
          description: entity.desc,
          success: true,
          count: totalCount,
          hasData: totalCount > 0,
        });

        if (totalCount > 0) {
          entitiesWithData.push({
            type: entity.type,
            count: totalCount,
            description: entity.desc,
          });
        }

        stepNum++;
      } catch (entityErr: any) {
        diagnostics.steps.push({
          step: `${stepNum}_entity_${entity.type.toLowerCase()}`,
          entityType: entity.type,
          description: entity.desc,
          success: false,
          error: entityErr.message,
        });
        stepNum++;
      }
    }

    diagnostics.entitiesWithData = entitiesWithData;

    // Conclusion with entity exploration insights
    const step4 = diagnostics.steps.find((s: any) => s.step === '4_purchase_wide_open');
    const step5 = diagnostics.steps.find((s: any) => s.step === '5_billpayment_wide_open');
    const step6 = diagnostics.steps.find((s: any) => s.step === '6_billpayment_all_types');
    const step7 = diagnostics.steps.find((s: any) => s.step === '7_purchase_all_types');

    // Build entity summary for conclusion
    const entitySummary = entitiesWithData.length > 0
      ? `\n\n📊 DATA FOUND IN: ${entitiesWithData.map(e => `${e.type} (${e.count})`).join(', ')}`
      : '\n\n⚠️ NO DATA FOUND in any entity type (Purchase, Bill, Invoice, Payment, etc.)';

    if (step4?.count === 0 && step5?.count === 0 && step6?.count === 0 && step7?.count === 0) {
      // No check transactions at all
      if (entitiesWithData.length === 0) {
        diagnostics.conclusion = `NO DATA: This company has ZERO transactions in any entity type. Either the realmId points to the wrong company, or this is a brand new/empty company.${entitySummary}`;
        diagnostics.recommendation = 'ACTION REQUIRED: Check Step 3 to confirm the company name matches what you expect. If wrong, disconnect and reconnect to QuickBooks, selecting the correct company during OAuth.';
      } else {
        const hasBills = entitiesWithData.find(e => e.type === 'Bill');
        const hasInvoices = entitiesWithData.find(e => e.type === 'Invoice');
        diagnostics.conclusion = `NO CHECK DATA: Company has data but ZERO Purchase/BillPayment transactions.${entitySummary}`;
        if (hasBills) {
          diagnostics.recommendation = `ACTION REQUIRED: You have ${hasBills.count} Bills but 0 BillPayments. The bills exist but haven't been paid yet. Check QuickBooks to see if payments are pending or recorded differently.`;
        } else if (hasInvoices) {
          diagnostics.recommendation = `ACTION REQUIRED: You have ${hasInvoices.count} Invoices but no Purchase/BillPayment data. This company might only track customer invoices, not vendor payments.`;
        } else {
          diagnostics.recommendation = 'ACTION REQUIRED: Data exists in other entity types but not in Purchase/BillPayment. Your financial data might be in JournalEntry, Deposit, or other non-standard transaction types.';
        }
      }
    } else if (step4?.count === 0 && step5?.count === 0 && (step6?.count > 0 || step7?.count > 0)) {
      diagnostics.conclusion = `FILTER MISMATCH: Company has ${step6?.count || 0} BillPayments and ${step7?.count || 0} Purchases, but NONE are typed as "Check".${entitySummary}`;
      diagnostics.recommendation = 'ACTION REQUIRED: Expand the sample data in steps 6-7 above and check the PaymentType/PayType fields. Your transactions are likely typed as "Cash", "CreditCard", "ACH", "EFT", or "Wire Transfer" instead of "Check". You may need to modify the pull-checks query to include these payment types.';
    } else if ((step4?.count > 0 || step5?.count > 0)) {
      diagnostics.conclusion = `DATA EXISTS: Found ${step4?.count || 0} Purchase checks and ${step5?.count || 0} BillPayment checks. The 0 results issue is in your date range or account filter.${entitySummary}`;
      diagnostics.recommendation = 'ACTION REQUIRED: (1) Try pulling data with NO filters (clear all dates and select "All Bank Accounts"). (2) Check your server console logs - they show exactly which filter eliminated your results. (3) The account name in QB might not match what you selected in the dropdown.';
    } else {
      diagnostics.conclusion = `INCONCLUSIVE: Some queries failed.${entitySummary}`;
      diagnostics.recommendation = 'Check the error messages in the failed steps above.';
    }

    diagnostics.summary = {
      totalSteps: diagnostics.steps.length,
      successfulSteps: diagnostics.steps.filter((s: any) => s.success).length,
      failedSteps: diagnostics.steps.filter((s: any) => s.success === false).length,
      timestamp: diagnostics.timestamp,
    };

    return res.status(200).json(diagnostics);
  } catch (error: any) {
    diagnostics.steps.push({ step: 'fatal_error', error: error.message });
    diagnostics.conclusion = `FATAL: ${error.message}`;
    return res.status(200).json(diagnostics);
  }
}
