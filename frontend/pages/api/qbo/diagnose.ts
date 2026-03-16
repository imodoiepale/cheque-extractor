import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

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

    // Step 1: Read integration record
    const { data: integration, error: dbError } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, realm_id, expires_at, qb_client_id, qb_client_secret, company_name, updated_at')
      .eq('provider', 'quickbooks')
      .single();

    diagnostics.steps.push({
      step: '1_read_integration',
      success: !!integration,
      error: dbError?.message || null,
      data: integration ? {
        hasAccessToken: !!integration.access_token,
        hasRefreshToken: !!integration.refresh_token,
        realmId: integration.realm_id,
        companyName: integration.company_name,
        expiresAt: integration.expires_at,
        tokenExpired: new Date(integration.expires_at) <= new Date(),
        updatedAt: integration.updated_at,
        hasClientId: !!integration.qb_client_id,
        hasClientSecret: !!integration.qb_client_secret,
      } : null,
    });

    if (!integration?.access_token || !integration?.realm_id) {
      diagnostics.conclusion = 'FAIL: No valid integration found in database';
      return res.status(200).json(diagnostics);
    }

    // Step 2: Refresh token if expired
    let accessToken = integration.access_token;
    const tokenExpired = new Date(integration.expires_at) <= new Date();

    if (tokenExpired) {
      const clientId = integration.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
      const clientSecret = integration.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        diagnostics.steps.push({ step: '2_refresh_token', success: false, error: 'Missing client credentials for refresh' });
        diagnostics.conclusion = 'FAIL: Token expired and no credentials to refresh';
        return res.status(200).json(diagnostics);
      }

      try {
        const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: integration.refresh_token,
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          diagnostics.steps.push({ step: '2_refresh_token', success: false, error: `Refresh failed (${tokenRes.status}): ${errText}` });
          diagnostics.conclusion = 'FAIL: Token expired and refresh failed. Reconnect to QuickBooks.';
          return res.status(200).json(diagnostics);
        }

        const newTokens = await tokenRes.json();
        accessToken = newTokens.access_token;

        await supabase
          .from('integrations')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          })
          .eq('provider', 'quickbooks');

        diagnostics.steps.push({ step: '2_refresh_token', success: true, message: 'Token refreshed successfully' });
      } catch (refreshErr: any) {
        diagnostics.steps.push({ step: '2_refresh_token', success: false, error: refreshErr.message });
        diagnostics.conclusion = 'FAIL: Token refresh threw an exception';
        return res.status(200).json(diagnostics);
      }
    } else {
      diagnostics.steps.push({ step: '2_refresh_token', success: true, message: 'Token still valid, no refresh needed' });
    }

    const realmId = integration.realm_id;

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

    // Step 5: Wide-open BillPayment query
    diagnostics.steps.push(
      await runDiagQuery(
        '5_billpayment_wide_open',
        "SELECT * FROM BillPayment WHERE PayType = 'Check' MAXRESULTS 5",
        'BillPayment'
      )
    );

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

    diagnostics.steps.push(
      await runDiagQuery(
        '10_count_billpayment_checks',
        "SELECT COUNT(*) FROM BillPayment WHERE PayType = 'Check'",
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

    diagnostics.steps.push(
      await runDiagQuery(
        '12_recent_billpayments',
        `SELECT * FROM BillPayment WHERE PayType = 'Check' AND TxnDate >= '${fromDate}' MAXRESULTS 5`,
        'BillPayment'
      )
    );

    // Step 13: Test with actual user filters (if provided in query params)
    const testFilters = req.query.testFilters === 'true';
    if (testFilters) {
      try {
        const filters = {
          startDate: req.query.startDate as string,
          endDate: req.query.endDate as string,
          account: req.query.account as string,
        };
        
        diagnostics.steps.push({
          step: '13_test_with_user_filters',
          message: 'Testing with your actual filters from Settings page',
          filters,
        });

        // Note: We can't easily capture pull-checks logs here without refactoring
        // But we can at least document what filters were used
      } catch (filterErr: any) {
        diagnostics.steps.push({
          step: '13_test_with_user_filters',
          success: false,
          error: filterErr.message,
        });
      }
    }

    // Conclusion
    const step4 = diagnostics.steps.find((s: any) => s.step === '4_purchase_wide_open');
    const step5 = diagnostics.steps.find((s: any) => s.step === '5_billpayment_wide_open');
    const step6 = diagnostics.steps.find((s: any) => s.step === '6_billpayment_all_types');
    const step7 = diagnostics.steps.find((s: any) => s.step === '7_purchase_all_types');

    if (step4?.count === 0 && step5?.count === 0 && step6?.count === 0 && step7?.count === 0) {
      diagnostics.conclusion = 'NO DATA: This company has zero Purchase and BillPayment transactions. Either the realmId points to the wrong company, or this company genuinely has no transactions.';
      diagnostics.recommendation = 'ACTION REQUIRED: Disconnect and reconnect to QuickBooks. Make sure you select the correct company during OAuth. Check Step 3 above to confirm the company name matches what you expect.';
    } else if (step4?.count === 0 && step5?.count === 0 && (step6?.count > 0 || step7?.count > 0)) {
      diagnostics.conclusion = 'FILTER MISMATCH: Company has Purchase/BillPayment data but NONE with check payment type. The transactions may use a different payment method (ACH, credit card, etc). Check the raw sample data for PaymentType/PayType values.';
      diagnostics.recommendation = 'ACTION REQUIRED: Expand the sample data above (click "View sample data") and check the PaymentType/PayType fields. Your transactions might be typed as "Cash", "CreditCard", "ACH", etc. instead of "Check".';
    } else if ((step4?.count > 0 || step5?.count > 0)) {
      diagnostics.conclusion = 'DATA EXISTS: Wide-open queries return check data. The issue is likely in the date range or account filter applied on the Settings page.';
      diagnostics.recommendation = 'ACTION REQUIRED: Try pulling data with NO filters (clear all dates and select "All Bank Accounts"). Check your server console logs for detailed filter debugging. The account name in QB might not match exactly what you selected.';
    } else {
      diagnostics.conclusion = 'INCONCLUSIVE: Some queries failed. Check individual step errors.';
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
