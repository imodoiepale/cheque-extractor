import type { NextApiRequest, NextApiResponse } from 'next';
import { backendAuthHeaders } from '@/lib/backend-auth';

/**
 * Proxy to the Kyriq Voice service (voice/app.py):
 *   POST /api/voice/chat    conversation turn
 *   POST /api/voice/speak   fixed-sample preview of one curated voice
 *   GET  /api/voice/voices  the curated voice list
 *
 * The browser never calls the service directly: this route checks the session
 * and forwards the caller's own token, which the service uses for every
 * Supabase read so RLS scopes the agent to the caller's firm.
 */
const VOICE_URL = (process.env.VOICE_URL || 'http://localhost:3095').replace(/\/$/, '');
const OPS: Record<string, 'GET' | 'POST'> = { chat: 'POST', speak: 'POST', voices: 'GET' };

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const op = String(req.query.op || '');
  const method = OPS[op];
  if (!method) return res.status(404).json({ error: 'Not found' });
  if (req.method !== method) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await backendAuthHeaders(req, res, { superAdminOnly: true });
  if (!auth) return;

  let body: string | undefined;
  if (op === 'chat') {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
    body = JSON.stringify({
      messages,
      speak: req.body?.speak !== false,
      focus: req.body?.focus ?? null,
      voice_id: typeof req.body?.voice_id === 'string' ? req.body.voice_id : null,
    });
  } else if (op === 'speak') {
    body = JSON.stringify({ voice_id: String(req.body?.voice_id || '') });
  }

  try {
    const r = await fetch(`${VOICE_URL}/${op}`, {
      method,
      headers: { ...auth, 'Content-Type': 'application/json' },
      body,
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text || '{}');
  } catch {
    res.status(503).json({ error: 'Kyriq Voice is not reachable right now.' });
  }
}
