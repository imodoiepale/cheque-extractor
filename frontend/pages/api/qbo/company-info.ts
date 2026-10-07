import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * Fetch QuickBooks Company Information
 * GET /api/qbo/company-info
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

    // One resolver (lib/qb-token.ts). This route used to read ONLY the legacy
    // integrations row, so on a firm with several connected companies it
    // reported the WRONG company's name. It now reads qb_connections first.
    const token = await getQbToken(supabase);
    if (!token.ok) {
      return res.status(token.reason === 'not_connected' ? 400 : 401).json({
        error:
          token.reason === 'not_connected'
            ? 'QuickBooks not connected'
            : 'Failed to refresh token. Please reconnect to QuickBooks.',
        connected: false,
      });
    }
    const accessToken = token.accessToken;
    const realmId = token.connection.realmId;

    // Fetch company info from QuickBooks
    const companyInfoUrl = `${QBO_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`;
    
    console.log('📡 Fetching QB company info:', {
      realmId: realmId,
      url: companyInfoUrl
    });

    const response = await fetch(companyInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ QB API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return res.status(response.status).json({ 
        error: 'Failed to fetch company info from QuickBooks',
        detail: errorText,
        connected: true
      });
    }

    const data = await response.json();
    const companyInfo = data.CompanyInfo;

    console.log('✅ QB Company Info fetched:', {
      companyName: companyInfo.CompanyName,
      legalName: companyInfo.LegalName,
      realmId: realmId
    });

    // Store company name in BOTH stores: integrations for the legacy readers,
    // qb_connections because that is the name the company switcher renders.
    await Promise.all([
      supabase
        .from('integrations')
        .update({
          company_name: companyInfo.CompanyName,
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'quickbooks'),
      supabase
        .from('qb_connections')
        .update({ company_name: companyInfo.CompanyName })
        .eq('realm_id', realmId),
    ]);

    return res.status(200).json({
      connected: true,
      realmId: realmId,
      companyName: companyInfo.CompanyName,
      legalName: companyInfo.LegalName,
      email: companyInfo.Email?.Address || null,
      phone: companyInfo.PrimaryPhone?.FreeFormNumber || null,
      address: companyInfo.CompanyAddr ? {
        line1: companyInfo.CompanyAddr.Line1,
        city: companyInfo.CompanyAddr.City,
        countrySubDivisionCode: companyInfo.CompanyAddr.CountrySubDivisionCode,
        postalCode: companyInfo.CompanyAddr.PostalCode,
      } : null,
    });
  } catch (error: any) {
    console.error('❌ Company info error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch company information',
      detail: error.message,
      connected: false
    });
  }
}
