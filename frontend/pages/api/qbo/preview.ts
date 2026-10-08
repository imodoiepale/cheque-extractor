import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

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

    // One resolver (lib/qb-token.ts). This route used to read ONLY the legacy
    // integrations row, so on a firm with several connected companies it
    // previewed the WRONG one. It now reads qb_connections first.
    const token = await getQbToken(supabase);
    if (!token.ok) {
      return res
        .status(token.reason === 'not_connected' ? 400 : 401)
        .json({ error: token.detail });
    }
    const accessToken = token.accessToken;

    const realmId = token.connection.realmId;

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
