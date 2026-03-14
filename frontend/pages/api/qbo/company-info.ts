import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

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

    await supabase
      .from('integrations')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      })
      .eq('provider', 'quickbooks');

    return newTokens.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

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
    let tokens = await getTokens(supabase);

    if (!tokens) {
      return res.status(400).json({ 
        error: 'QuickBooks not connected',
        connected: false 
      });
    }

    // Check if token is expired
    const expiresAt = new Date(tokens.expires_at);
    const now = new Date();
    let accessToken = tokens.access_token;

    if (expiresAt <= now) {
      console.log('🔄 Access token expired, refreshing...');
      const newToken = await refreshAccessToken(supabase, tokens);
      if (!newToken) {
        return res.status(401).json({ 
          error: 'Failed to refresh token. Please reconnect to QuickBooks.',
          connected: false 
        });
      }
      accessToken = newToken;
    }

    // Fetch company info from QuickBooks
    const companyInfoUrl = `${QBO_BASE}/v3/company/${tokens.realm_id}/companyinfo/${tokens.realm_id}?minorversion=73`;
    
    console.log('📡 Fetching QB company info:', {
      realmId: tokens.realm_id,
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
      realmId: tokens.realm_id
    });

    // Store company name in integrations table for quick access
    await supabase
      .from('integrations')
      .update({
        company_name: companyInfo.CompanyName,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'quickbooks');

    return res.status(200).json({
      connected: true,
      realmId: tokens.realm_id,
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
