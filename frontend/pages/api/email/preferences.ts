import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { isMissingSchema } from '@/lib/billing/service';

/**
 * GET  /api/email/preferences  -> { email, subscribed, unsubscribed_at }
 * PUT  /api/email/preferences  body { subscribed: boolean }
 *
 * The other half of the privacy policy's promise: users can opt out "through a
 * link or by updating preferences in account settings". The link is
 * pages/api/email/unsubscribe.ts; this is the settings side, and it is the only
 * way back IN after someone unsubscribes — a one-click link cannot re-subscribe
 * anyone, because a link that could would be abusable by anyone holding it.
 *
 * Scoped to the caller's own address. An administrator cannot change a
 * colleague's email preferences, which is deliberate: consent is personal.
 *
 * No UI calls this yet. The settings toggle is not built.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'unauthenticated', message: err?.message });
  }

  const email = (ctx.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'no_email', message: 'This account has no email address.' });
  }

  // Service client: migration 034 revokes writes on email_preferences from
  // `authenticated`, and every statement below pins tenant_id AND the caller's
  // own address, so the service role cannot be steered at anyone else's row.
  const svc = createServiceClient();

  try {
    if (req.method === 'GET') {
      const { data, error } = await svc
        .from('email_preferences')
        .select('unsubscribed_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({
        email,
        subscribed: !data?.unsubscribed_at,
        unsubscribed_at: data?.unsubscribed_at ?? null,
      });
    }

    if (typeof req.body?.subscribed !== 'boolean') {
      return res.status(400).json({ error: 'invalid_body', message: 'Send { subscribed: boolean }.' });
    }

    const now = new Date().toISOString();
    const { data, error } = await svc
      .from('email_preferences')
      .upsert(
        {
          tenant_id: ctx.tenantId,
          email,
          unsubscribed_at: req.body.subscribed ? null : now,
          updated_at: now,
          source: 'account_settings',
        },
        { onConflict: 'tenant_id,email' }
      )
      .select('unsubscribed_at')
      .maybeSingle();
    if (error) throw error;
    // A 200 from the driver is not proof: assert on the parsed row.
    if (!data) throw new Error('Preference write returned no row — suspect RLS on email_preferences');
    if (Boolean(data.unsubscribed_at) === req.body.subscribed) {
      throw new Error('Preference write did not persist');
    }

    return res.status(200).json({
      email,
      subscribed: !data.unsubscribed_at,
      unsubscribed_at: data.unsubscribed_at ?? null,
    });
  } catch (err: any) {
    if (isMissingSchema(err)) {
      return res.status(409).json({
        error: 'email_schema_missing',
        message: 'Apply supabase/migrations/034_email_and_qb_health.sql first.',
      });
    }
    console.error(`[email/preferences ${req.method}]`, err);
    return res.status(500).json({ error: 'server_error', message: err?.message || 'Request failed' });
  }
}
