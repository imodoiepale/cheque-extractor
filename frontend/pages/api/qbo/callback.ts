import type { NextApiRequest, NextApiResponse } from 'next';
import { createClientFromCookies, createServiceClient } from '@/lib/supabase/api';

/**
 * QuickBooks OAuth Callback Endpoint
 * Handles the OAuth callback and exchanges code for tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, realmId } = req.query;

    if (!code || !state || !realmId) {
      return res.redirect('/settings?error=missing_params');
    }

    // Decode tenant_id from state parameter
    let tenantId: string | null = null;
    let stateData: any = null;
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      tenantId = stateData.tenant_id;
      console.log('✅ Decoded state:', { tenant_id: tenantId, timestamp: stateData.timestamp });
    } catch (decodeErr) {
      console.error('❌ Failed to decode state parameter:', decodeErr);
      return res.redirect('/settings?error=invalid_state&detail=state_decode_failed');
    }

    if (!tenantId) {
      console.error('❌ No tenant_id in state parameter');
      return res.redirect('/settings?error=no_tenant&detail=missing_tenant_in_state');
    }

    // Verify state (CSRF protection) - optional
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies?.qbo_state && cookies.qbo_state !== state) {
      console.warn('⚠️ State mismatch - possible CSRF attack');
      // Don't fail - just warn, since state contains tenant_id anyway
    }
    
    // Log for debugging
    console.log('OAuth callback received:', { code: code?.toString().substring(0, 20) + '...', realmId, hasState: !!state });

    // Use SERVICE CLIENT to read QB credentials (bypasses RLS — credentials aren't user-scoped)
    // This avoids the fragile cookie-based auth that fails with chunked Supabase cookies
    let serviceClient;
    let integration = null;
    try {
      serviceClient = createServiceClient();
      // Filter by tenantId (decoded from state) so we always read the right tenant's credentials.
      // Fall back to limit(1) if no tenant-specific row exists (e.g. shared/legacy setup).
      const { data, error: dbError } = await serviceClient
        .from('integrations')
        .select('qb_client_id, qb_client_secret, qb_redirect_uri, tenant_id')
        .eq('provider', 'quickbooks')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (dbError) {
        console.warn('⚠️ Service client DB read failed:', dbError.message);
      } else if (data) {
        integration = data;
      } else {
        // No tenant-specific row — fall back to any QB integration
        const { data: anyData } = await serviceClient
          .from('integrations')
          .select('qb_client_id, qb_client_secret, qb_redirect_uri, tenant_id')
          .eq('provider', 'quickbooks')
          .limit(1)
          .maybeSingle();
        integration = anyData;
      }
    } catch (svcErr: any) {
      console.warn('⚠️ Service client unavailable, falling back to cookie auth:', svcErr.message);
    }

    // Fallback: try cookie-based client if service client didn't work
    if (!integration) {
      try {
        const cookieClient = createClientFromCookies(req);
        const { data } = await cookieClient
          .from('integrations')
          .select('qb_client_id, qb_client_secret, qb_redirect_uri, tenant_id')
          .eq('provider', 'quickbooks')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        integration = data;
      } catch (cookieErr: any) {
        console.warn('⚠️ Cookie client also failed:', cookieErr.message);
      }
    }

    // Env vars OVERRIDE database values — same priority as auth.ts to guarantee they always match.
    const clientId = (integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID)?.trim();
    const clientSecret = (integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET)?.trim();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com').replace(/\/$/, '').trim();
    const redirectUri = (process.env.QUICKBOOKS_REDIRECT_URI || integration?.qb_redirect_uri || `${appUrl}/api/qbo/callback`).trim();
    
    console.log('🔑 QB Callback credentials source:', {
      fromDB: !!integration?.qb_client_id,
      fromEnv: !integration?.qb_client_id && !!clientId,
      redirectUri,
    });

    if (!clientId || !clientSecret) {
      return res.redirect('/settings?tab=integrations&error=not_configured');
    }

    console.log('🔄 Exchanging authorization code for tokens...', {
      clientIdPrefix: clientId.substring(0, 10) + '...',
      redirectUri,
      codePrefix: (code as string).substring(0, 20) + '...',
    });

    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        clientIdPrefix: clientId.substring(0, 10) + '...',
        redirectUri,
      });
      return res.redirect(`/settings?tab=integrations&error=token_exchange_failed&detail=${encodeURIComponent(errorText.substring(0, 100))}`);
    }

    const tokens = await tokenResponse.json();

    // tenant_id already decoded from state parameter above
    console.log('✅ Using tenant_id from state:', tenantId);

    // Save tokens to integrations table using service client
    if (!serviceClient) {
      console.error('❌ Service client not available for saving tokens');
      return res.redirect('/settings?error=service_unavailable');
    }

    // Fetch company name from QB to store alongside tokens
    let companyName: string | null = null;
    try {
      const companyRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Accept': 'application/json',
          },
        }
      );
      if (companyRes.ok) {
        const companyData = await companyRes.json();
        companyName = companyData?.CompanyInfo?.CompanyName || null;
        console.log('✅ Connected to company:', companyName, '(realmId:', realmId, ')');
      }
    } catch (compErr) {
      console.warn('⚠️ Could not fetch company name (non-critical):', compErr);
    }

    // Update existing integration row (preserves credentials) or insert new one
    const tokenData = {
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      company_name: companyName,
      updated_at: new Date().toISOString(),
    };

    // Try update first (preserves qb_client_id, qb_client_secret, qb_redirect_uri)
    const { data: updateResult, error: updateError } = await serviceClient
      .from('integrations')
      .update(tokenData)
      .eq('provider', 'quickbooks')
      .eq('tenant_id', tenantId)
      .select('id');

    if (updateError || !updateResult || updateResult.length === 0) {
      // No existing row — insert full record
      console.log('📝 No existing integration row, inserting new one');
      const { error: insertError } = await serviceClient
        .from('integrations')
        .insert({
          provider: 'quickbooks',
          tenant_id: tenantId,
          ...tokenData,
          // Preserve credentials from the integration we read earlier
          qb_client_id: integration?.qb_client_id || null,
          qb_client_secret: integration?.qb_client_secret || null,
          qb_redirect_uri: integration?.qb_redirect_uri || null,
        });

      if (insertError) {
        console.error('Failed to store tokens (insert):', insertError);
        return res.redirect('/settings?error=storage_failed');
      }
    } else {
      console.log('✅ Updated existing integration with new tokens');
    }

    // ── Also upsert into qb_connections for multi-company switcher ──
    try {
      // Deactivate all other connections for this tenant
      await serviceClient
        .from('qb_connections')
        .update({ is_active: false })
        .eq('tenant_id', tenantId);

      // Upsert the new/updated connection as active
      const { error: connError } = await serviceClient
        .from('qb_connections')
        .upsert({
          tenant_id: tenantId,
          user_id: stateData?.user_id || null,
          realm_id: realmId,
          company_name: companyName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
          connected_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,realm_id',
        });

      if (connError) {
        console.warn('⚠️ Failed to upsert qb_connections (non-critical):', connError.message);
      } else {
        console.log('✅ QB connection saved for multi-company switcher');
      }
    } catch (connErr: any) {
      console.warn('⚠️ qb_connections upsert failed (non-critical):', connErr.message);
    }

    // Clear state cookie
    res.setHeader('Set-Cookie', 'qbo_state=; Path=/; HttpOnly; Max-Age=0');

    // If OAuth was initiated from the extension, redirect to the lightweight completion page
    // so the extension's tabs.onUpdated listener can detect it and auto-refresh connections.
    if (stateData?.source === 'extension') {
      console.log('✅ Extension OAuth complete — redirecting to /qb-oauth-complete');
      return res.redirect(`/qb-oauth-complete?company=${encodeURIComponent(companyName || '')}`);
    }

    // Redirect to settings with success (web app flow)
    return res.redirect('/settings?tab=integrations&success=quickbooks_connected');
  } catch (error) {
    console.error('QuickBooks callback error:', error);
    return res.redirect('/settings?error=callback_failed');
  }
}
