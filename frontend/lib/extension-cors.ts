import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * CORS for the `/api/extension/*` routes.
 *
 * These routes hand out tenant secrets and mutate QuickBooks connections, so
 * they must not be readable from an arbitrary web origin. A page cannot forge an
 * `Origin` of `chrome-extension://…`, so reflecting only those is a real
 * restriction. Pin to specific ids with EXTENSION_ORIGINS (comma-separated).
 */
export function allowedExtensionOrigin(origin: string | undefined): string | null {
  if (!origin) return null;

  const pinned = (process.env.EXTENSION_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (pinned.length > 0) return pinned.includes(origin) ? origin : null;
  return origin.startsWith('chrome-extension://') ? origin : null;
}

/**
 * Applies the CORS headers and handles preflight. Returns true when the caller
 * should stop (the response has already been sent).
 */
export function applyExtensionCors(
  req: NextApiRequest,
  res: NextApiResponse,
  methods: string
): boolean {
  const origin = allowedExtensionOrigin(req.headers.origin);

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.status(origin ? 204 : 403).end();
    return true;
  }

  // A same-origin or server-side call sends no Origin at all; only reject a
  // request that declares an origin we do not allow.
  if (req.headers.origin && !origin) {
    res.status(403).json({ error: 'Origin not allowed' });
    return true;
  }

  return false;
}
