import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { isSuperAdmin } from '@/lib/super-admin';

/**
 * /api/admin/comp-accounts — Super Admin comp accounts (CHECKLIST section 5).
 *
 * "Make it possible for me (super Admin) to give free accounts." This is how
 * the pilot firms get in: a grant with a reason and an expiry overrides the
 * trial limits, so a pilot is never cut off mid-test.
 *
 *   GET    ?tenantId=&includeExpired=  list grants
 *   POST   { tenantId, reason, days | expiresAt, checkLimit? }  grant
 *   DELETE { grantId, reason? }         revoke
 *
 * Three independent gates, because a hidden menu item is not access control:
 *   1. a valid session (getAuthContext)
 *   2. the Super Admin email allowlist (lib/super-admin.ts)
 *   3. RLS — comp_grants has no write policy for `authenticated`, and INSERT /
 *      UPDATE / DELETE are revoked from that role, so these writes only work
 *      through the service client below.
 *
 * The audit entry is NOT written here. A trigger on comp_grants writes it
 * (migration 029), so a future caller that forgets still cannot grant silently.
 */

const MAX_COMP_DAYS = 365;

async function requireSuperAdmin(req: NextApiRequest, res: NextApiResponse) {
  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    res.status(401).json({ error: 'unauthenticated', message: err?.message });
    return null;
  }
  if (!isSuperAdmin(ctx.email)) {
    res.status(403).json({ error: 'forbidden', message: 'Super Admin only.' });
    return null;
  }
  return ctx;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireSuperAdmin(req, res);
  if (!ctx) return;

  const admin = createServiceClient();

  // ── List ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let query = admin
      .from('comp_grants')
      .select('id, tenant_id, granted_by_email, reason, starts_at, expires_at, check_limit, revoked_at, revoke_reason, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (typeof req.query.tenantId === 'string' && req.query.tenantId) {
      query = query.eq('tenant_id', req.query.tenantId);
    }
    if (req.query.includeExpired !== 'true') {
      query = query.is('revoked_at', null).gt('expires_at', new Date().toISOString());
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'list_failed', message: error.message });
    return res.status(200).json({ grants: data ?? [] });
  }

  // ── Grant ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { tenantId, reason, days, expiresAt, checkLimit } = req.body ?? {};

    if (typeof tenantId !== 'string' || !tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'reason is required (at least 3 characters)' });
    }

    // Expiry is mandatory: "a free account for a set period". Either an
    // explicit date or a number of days, never open-ended.
    let expiry: Date;
    if (typeof expiresAt === 'string' && expiresAt) {
      expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime())) {
        return res.status(400).json({ error: 'expiresAt is not a valid date' });
      }
    } else if (Number.isFinite(Number(days)) && Number(days) > 0) {
      const n = Math.min(Number(days), MAX_COMP_DAYS);
      expiry = new Date(Date.now() + n * 86400_000);
    } else {
      return res.status(400).json({ error: 'one of expiresAt or days is required' });
    }
    if (expiry.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'expiry must be in the future' });
    }

    if (checkLimit !== undefined && checkLimit !== null) {
      if (!Number.isInteger(checkLimit) || checkLimit <= 0) {
        return res.status(400).json({ error: 'checkLimit must be a positive integer, or omitted for unlimited' });
      }
    }

    // Reject an unknown tenant here rather than relying on the FK, so the
    // caller gets a useful message instead of a constraint name.
    const { data: tenant } = await admin
      .from('tenants')
      .select('id, name')
      .eq('id', tenantId)
      .maybeSingle();
    if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });

    const { data, error } = await admin
      .from('comp_grants')
      .insert({
        tenant_id: tenantId,
        granted_by: ctx.userId,
        granted_by_email: ctx.email,
        reason: reason.trim(),
        expires_at: expiry.toISOString(),
        check_limit: checkLimit ?? null,
      })
      .select('id, tenant_id, reason, starts_at, expires_at, check_limit')
      .single();

    if (error) return res.status(500).json({ error: 'grant_failed', message: error.message });

    return res.status(201).json({ granted: true, tenantName: tenant.name, grant: data });
  }

  // ── Revoke ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { grantId, reason } = req.body ?? {};
    if (typeof grantId !== 'string' || !grantId) {
      return res.status(400).json({ error: 'grantId is required' });
    }

    // Revoking is an UPDATE, not a DELETE: the grant and its reason stay in the
    // table so the audit trail is not a list of holes.
    const { data, error } = await admin
      .from('comp_grants')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: ctx.userId,
        revoke_reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'revoked by Super Admin',
      })
      .eq('id', grantId)
      .is('revoked_at', null)
      .select('id, tenant_id, revoked_at, revoke_reason')
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'revoke_failed', message: error.message });
    if (!data) return res.status(404).json({ error: 'grant_not_found_or_already_revoked' });

    return res.status(200).json({ revoked: true, grant: data });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
