import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { isSuperAdmin } from '@/lib/super-admin';

const PYTHON_API = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

/**
 * POST /api/admin/lab/run: OCR Lab proxy (multipart: file, doc_type, engines).
 *
 * Super admins only. The multipart body is streamed to the backend untouched,
 * with the caller's token, and the backend re-checks the admin email so the
 * engines' credits cannot be spent by a direct call.
 */
export const config = {
  api: { bodyParser: false },
  // Hosted engines are async (submit, then poll), so a run can take minutes.
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'unauthenticated', message: err?.message });
  }
  if (!isSuperAdmin(ctx.email)) return res.status(403).json({ error: 'forbidden' });

  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (await ctx.supabase.auth.getSession()).data.session?.access_token;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);

  try {
    const upstream = await fetch(`${PYTHON_API}/api/lab/run`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: Buffer.concat(chunks),
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    return res.send(text || '{}');
  } catch (err: any) {
    return res.status(502).json({ error: 'backend_unreachable', message: err?.message });
  }
}
