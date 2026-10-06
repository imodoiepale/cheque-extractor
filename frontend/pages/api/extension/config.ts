import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';
import { applyExtensionCors } from '@/lib/extension-cors';

/**
 * Per-tenant configuration for the Chrome extension.
 *
 * This returns secrets (the tenant's Gemini key, the Intuit client id), so it
 * requires a valid session. It previously served an unauthenticated branch to
 * any origin; the extension does not need that, because it ships the public
 * Supabase URL and anon key in its own BOOTSTRAP_CONFIG and merges those over
 * whatever this route returns.
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyExtensionCors(req, res, 'GET')) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Per-tenant overrides (e.g. a firm's own Gemini key). RLS scopes this to
    // the caller's tenant, so no explicit tenant filter is needed here.
    const { data: integration } = await supabase
      .from('integrations')
      .select('gemini_api_key')
      .eq('provider', 'quickbooks')
      .maybeSingle();

    // `qbClientId` is deliberately NOT returned. It was served here and is read
    // by nothing in the extension — the service worker only ever logged it. The
    // OAuth flow goes through /api/qbo/auth, which keeps the client id and
    // secret server-side where they belong.
    //
    // `geminiApiKey` IS still returned, because it is genuinely consumed:
    // extractCheckData() in the service worker calls Gemini directly with it.
    // That path is only reachable from popup/popup.js, which the manifest never
    // mounts (there is no default_popup) — so it is dead today, but removing the
    // key would break it the moment anyone wires the popup up. Worth replacing
    // with a backend proxy so a tenant's provider key never reaches a client at
    // all; until then, this route requires a session and extension-only CORS.
    return res.status(200).json({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      geminiApiKey: integration?.gemini_api_key || process.env.GEMINI_API_KEY || '',
    });
  } catch (error: any) {
    console.error('Extension config error:', error);
    return res.status(500).json({ error: error.message });
  }
}
