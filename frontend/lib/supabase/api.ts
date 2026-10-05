import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest } from 'next';

/**
 * Create an authenticated Supabase client for API routes.
 * Uses the user's auth token from the request, which enforces RLS policies.
 * 
 * @param req - The Next.js API request object
 * @returns Authenticated Supabase client that respects RLS
 */
export function createAuthenticatedClient(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
      },
    }
  );
}

/**
 * Create an authenticated Supabase client from cookies.
 * Used for OAuth callbacks where Authorization header is not available.
 * Handles @supabase/ssr chunked cookie format (sb-xxx-auth-token.0, .1, etc.)
 * 
 * @param req - The Next.js API request object
 * @returns Authenticated Supabase client that respects RLS
 */
export function createClientFromCookies(req: NextApiRequest) {
  // Parse cookies to get the auth token
  const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, ...valueParts] = cookie.trim().split('=');
    acc[key] = valueParts.join('='); // Handle '=' chars in cookie values
    return acc;
  }, {} as Record<string, string>);

  if (!cookies) {
    throw new Error('No cookies found in request');
  }

  console.log('🍪 Available cookies:', Object.keys(cookies));

  // Try to find the auth token — handle both single and chunked cookie formats
  // @supabase/ssr uses chunked cookies: sb-{ref}-auth-token.0, sb-{ref}-auth-token.1, etc.
  let authTokenRaw: string | null = null;

  // 1. Try single cookie format first
  const singleCookieKey = Object.keys(cookies).find(key => 
    key.startsWith('sb-') && key.endsWith('-auth-token') && !key.includes('.') 
  );
  if (singleCookieKey && cookies[singleCookieKey]) {
    authTokenRaw = decodeURIComponent(cookies[singleCookieKey]);
    console.log('🍪 Found single auth cookie:', singleCookieKey);
  }

  // 2. Try chunked cookie format (sb-xxx-auth-token.0, .1, .2, ...)
  if (!authTokenRaw) {
    const chunkPrefix = Object.keys(cookies).find(key =>
      key.startsWith('sb-') && key.includes('-auth-token.0')
    );
    if (chunkPrefix) {
      const baseKey = chunkPrefix.replace('.0', '');
      let combined = '';
      let i = 0;
      while (cookies[`${baseKey}.${i}`] !== undefined) {
        combined += cookies[`${baseKey}.${i}`];
        i++;
      }
      if (combined) {
        authTokenRaw = decodeURIComponent(combined);
        console.log(`🍪 Found chunked auth cookies: ${i} chunks for ${baseKey}`);
      }
    }
  }

  if (!authTokenRaw) {
    console.error('🍪 No Supabase auth token found. Available cookies:', Object.keys(cookies));
    throw new Error('No Supabase auth token found in cookies');
  }

  // Parse the token — try base64-encoded JSON, then raw JSON, then raw token
  let token: string;
  try {
    // Try base64 decode first
    const decoded = JSON.parse(Buffer.from(authTokenRaw, 'base64').toString());
    token = decoded.access_token || decoded[0];
    if (!token) throw new Error('No access_token in base64-decoded cookie');
    console.log('🍪 Decoded auth token via base64');
  } catch {
    try {
      // Try raw JSON parse (some Supabase versions store JSON directly)
      const decoded = JSON.parse(authTokenRaw);
      token = decoded.access_token || decoded[0];
      if (!token) throw new Error('No access_token in JSON cookie');
      console.log('🍪 Decoded auth token via JSON parse');
    } catch {
      // Use raw value as fallback
      token = authTokenRaw;
      console.log('🍪 Using raw auth token value');
    }
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
      },
    }
  );
}

/**
 * Create an authenticated client from whichever transport the caller used.
 *
 * API routes in this repo are hit two ways: hooks send an `Authorization:
 * Bearer` header (see hooks/useMatches.ts), while plain `fetch('/api/...')`
 * from a page sends only cookies (see app/(app)/settings/team/page.tsx).
 * createAuthenticatedClient() throws on the second case, which is why the team
 * page failed silently. This picks the right one instead of adding a third
 * auth path — the cookie branch uses @supabase/ssr, the same mechanism as
 * lib/supabase/proxy.ts and pages/api/admin/*.
 */
export async function createClientFromRequest(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return createAuthenticatedClient(req);
  }

  const { createServerClient } = await import('@supabase/ssr');
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({
            name,
            value: value || '',
          }));
        },
        setAll() {
          /* API routes here do not rotate the session cookie */
        },
      },
    }
  );
}

/**
 * Create a service role Supabase client (bypasses RLS).
 * ⚠️ Only use this for admin operations where you need to bypass RLS.
 * For normal user operations, use createAuthenticatedClient() instead.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY environment variable');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
