/**
 * Session check + token forwarding for the pages/api proxies that call the
 * Python backend. With REQUIRE_AUTH=true on Railway the backend rejects calls
 * without a live Supabase session token, and a proxy that forwards anything
 * unauthenticated would also hand anonymous callers the backend.
 *
 * Returns the bearer headers, or null after answering 401 itself.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@supabase/ssr';

export async function backendAuthHeaders(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Record<string, string> | null> {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })),
      setAll: () => {},
    },
  });

  // getUser() asks Supabase Auth, so an expired or forged token fails here.
  const { data } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!data.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  const token = bearer ?? (await supabase.auth.getSession()).data.session?.access_token ?? null;
  if (!token) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}
