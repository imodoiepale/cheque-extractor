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
 * Create a service role Supabase client (bypasses RLS).
 * ⚠️ Only use this for admin operations where you need to bypass RLS.
 * For normal user operations, use createAuthenticatedClient() instead.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
