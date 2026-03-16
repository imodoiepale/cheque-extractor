import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * QuickBooks Data Preview API
 * GET /api/qbo/preview?type=Purchase&limit=50
 * 
 * Fetches real-time data from QuickBooks for preview in tables.
 * Supports all major entity types with pagination.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);

    const entityType = (req.query.type as string) || 'Purchase';
    const limit = parseInt(req.query.limit as string) || 50;
    const startPosition = parseInt(req.query.start as string) || 1;

    // Get integration
    const { data: integration, error: dbError } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, realm_id, expires_at, qb_client_id, qb_client_secret')
      .eq('provider', 'quickbooks')
      .single();

    if (!integration?.access_token || !integration?.realm_id) {
      return res.status(400).json({ error: 'QuickBooks not connected' });
    }

    // Refresh token if expired
    let accessToken = integration.access_token;
    const tokenExpired = new Date(integration.expires_at) <= new Date();

    if (tokenExpired) {
      const clientId = integration.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
      const clientSecret = integration.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(401).json({ error: 'Cannot refresh token' });
      }

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
        return res.status(401).json({ error: 'Token refresh failed' });
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
    }

    const realmId = integration.realm_id;

    // Build query based on entity type
    let query = '';
    let filterClientSide = false;

    switch (entityType) {
      case 'Purchase':
        query = `SELECT * FROM Purchase WHERE PaymentType = 'Check' STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'BillPayment':
        query = `SELECT * FROM BillPayment STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        filterClientSide = true; // Filter PayType='Check' client-side
        break;
      case 'Bill':
        query = `SELECT * FROM Bill STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Invoice':
        query = `SELECT * FROM Invoice STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Payment':
        query = `SELECT * FROM Payment STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Deposit':
        query = `SELECT * FROM Deposit STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Transfer':
        query = `SELECT * FROM Transfer STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'JournalEntry':
        query = `SELECT * FROM JournalEntry STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Vendor':
        query = `SELECT * FROM Vendor STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Customer':
        query = `SELECT * FROM Customer STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Account':
        query = `SELECT * FROM Account STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      case 'Item':
        query = `SELECT * FROM Item STARTPOSITION ${startPosition} MAXRESULTS ${limit}`;
        break;
      default:
        return res.status(400).json({ error: `Unsupported entity type: ${entityType}` });
    }

    // Fetch from QuickBooks
    const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ 
        error: `QuickBooks API error: ${errText.substring(0, 200)}` 
      });
    }

    const data = await response.json();
    let records = data?.QueryResponse?.[entityType] || [];
    const totalCount = data?.QueryResponse?.totalCount || records.length;

    // Client-side filtering if needed
    if (filterClientSide && entityType === 'BillPayment') {
      records = records.filter((bp: any) => {
        const payType = bp.PayType || bp.CheckPayment?.PayType || '';
        return payType.toLowerCase() === 'check';
      });
    }

    return res.status(200).json({
      success: true,
      entityType,
      records,
      count: records.length,
      totalCount,
      startPosition,
      limit,
    });
  } catch (error: any) {
    console.error('❌ Preview error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch QB data' });
  }
}
