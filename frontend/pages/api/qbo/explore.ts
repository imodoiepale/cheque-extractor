import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * QuickBooks Data Explorer
 * GET /api/qbo/explore
 * 
 * Fetches counts and samples from ALL major QB entity types to show
 * what data actually exists in the company (not just checks).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    company: null,
    entities: [],
  };

  try {
    const supabase = createAuthenticatedClient(req);

    // One resolver (lib/qb-token.ts). This route used to read ONLY the legacy
    // integrations row, so on a firm with several connected companies it
    // explored the WRONG one. It now reads qb_connections first.
    const token = await getQbToken(supabase);
    if (!token.ok) {
      return res
        .status(token.reason === 'not_connected' ? 400 : 401)
        .json({ error: token.detail });
    }
    const accessToken = token.accessToken;

    const realmId = token.connection.realmId;
    results.company = {
      name: token.connection.companyName,
      realmId,
    };

    // Helper to query QB and get count + samples
    async function exploreEntity(entityType: string, description: string, sampleQuery?: string) {
      try {
        // Get count
        const countQuery = `SELECT COUNT(*) FROM ${entityType}`;
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

        // Get sample data (first 3 records)
        const query = sampleQuery || `SELECT * FROM ${entityType} MAXRESULTS 3`;
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
            entityType,
            description,
            success: false,
            error: `HTTP ${response.status}: ${errText.substring(0, 200)}`,
          };
        }

        const data = await response.json();
        const records = data?.QueryResponse?.[entityType] || [];

        return {
          entityType,
          description,
          success: true,
          totalCount,
          sampleCount: records.length,
          samples: records.map((r: any) => ({
            Id: r.Id,
            TxnDate: r.TxnDate || r.MetaData?.CreateTime,
            DocNumber: r.DocNumber,
            TotalAmt: r.TotalAmt || r.Total || r.Amount,
            VendorRef: r.VendorRef,
            CustomerRef: r.CustomerRef,
            EntityRef: r.EntityRef,
            PaymentType: r.PaymentType,
            PayType: r.PayType,
            PaymentMethodRef: r.PaymentMethodRef,
            AccountRef: r.AccountRef,
            CheckPayment: r.CheckPayment,
            Line: r.Line ? r.Line.slice(0, 2) : undefined, // First 2 line items
          })),
          rawFirst: records.length > 0 ? records[0] : null,
        };
      } catch (err: any) {
        return {
          entityType,
          description,
          success: false,
          error: err.message,
        };
      }
    }

    // Explore all major QB entity types
    const entityTypes = [
      { type: 'Purchase', desc: 'Purchase transactions (expenses, checks written)' },
      { type: 'BillPayment', desc: 'Bill payments (most contractor checks)', query: 'SELECT * FROM BillPayment MAXRESULTS 3' },
      { type: 'Bill', desc: 'Unpaid bills from vendors' },
      { type: 'Payment', desc: 'Customer payments received' },
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
    ];

    for (const entity of entityTypes) {
      const result = await exploreEntity(entity.type, entity.desc, entity.query);
      results.entities.push(result);
    }

    // Add summary
    results.summary = {
      totalEntitiesChecked: results.entities.length,
      entitiesWithData: results.entities.filter((e: any) => e.totalCount > 0).length,
      entitiesWithoutData: results.entities.filter((e: any) => e.totalCount === 0).length,
      failedQueries: results.entities.filter((e: any) => !e.success).length,
    };

    // Highlight entities with data
    results.hasData = results.entities
      .filter((e: any) => e.totalCount > 0)
      .map((e: any) => ({
        type: e.entityType,
        count: e.totalCount,
        description: e.description,
      }));

    return res.status(200).json(results);
  } catch (error: any) {
    console.error('❌ Explore error:', error);
    return res.status(500).json({ error: error.message || 'Failed to explore QB data' });
  }
}
