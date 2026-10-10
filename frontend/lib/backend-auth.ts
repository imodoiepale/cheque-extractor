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

/**
 * backendAuthHeaders + tenant ownership of one job. The lookup runs as the
 * caller (anon key + their token), so check_jobs RLS decides: a job of another
 * firm is simply not found, and the proxy answers 404 before its service-role
 * fallbacks (DB reads, storage redirects) ever run.
 */
export async function jobAccessHeaders(
  req: NextApiRequest,
  res: NextApiResponse,
  jobId: string | undefined
): Promise<Record<string, string> | null> {
  if (!jobId || !/^[A-Za-z0-9_-]{1,80}$/.test(jobId)) {
    res.status(400).json({ error: 'Invalid job id' });
    return null;
  }
  const headers = await backendAuthHeaders(req, res);
  if (!headers) return null;

  const asCaller = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
    global: { headers },
  });
  const { data } = await asCaller.from('check_jobs').select('job_id').eq('job_id', jobId).maybeSingle();
  if (!data) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  return headers;
}
