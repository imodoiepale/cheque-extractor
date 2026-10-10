import type { NextApiRequest, NextApiResponse } from 'next';
import { backendAuthHeaders } from '@/lib/backend-auth';

/**
 * Proxy to the Kyriq Voice service (voice/app.py). The browser never calls it
 * directly: this route checks the session and forwards the caller's own token,
 * which the service uses for every Supabase read so RLS scopes the agent to
 * the caller's firm.
 */
const VOICE_URL = (process.env.VOICE_URL || 'http://localhost:3095').replace(/\/$/, '');

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await backendAuthHeaders(req, res);
  if (!auth) return;

  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  try {
    const r = await fetch(`${VOICE_URL}/chat`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, speak: req.body?.speak !== false }),
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text || '{}');
  } catch {
    res.status(503).json({ error: 'Kyriq Voice is not reachable right now.' });
  }
}
