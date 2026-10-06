import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceClient } from '@/lib/supabase/api';
import { isSuperAdmin } from '@/lib/super-admin';
import { loadFirmBilling, stripeLinks } from '@/lib/admin/billing-data';
import { productRole } from '@/lib/roles';
import { stripeEnvFromKey } from '@/lib/billing/stripe';

/**
 * GET /api/admin/firms
 *
 * The Super Admin firm view from the v17 billing document: firm, plan, billing
 * frequency, trial status and usage, subscription status, monthly usage,
 * overage, payment status, paid-through date, cancellation status, Stripe IDs
 * and links — plus the comp-account grant when the other parcel's table exists.
 *
 * Response:
 *   { firms: Firm[], sources: { trial, usage, subscription, comp, missing[] } }
 *
 * Super admin only, by email (lib/super-admin.ts), same gate as the other
 * /api/admin/* routes. Super Admin is platform staff, not a tenant role, so
 * lib/roles.ts deliberately grants `superadmin.view` to nobody.
 */
async function getUser(req: NextApiRequest) {
  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value || '' }));
        },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const user = await getUser(req);
  if (!user || !isSuperAdmin(user.email)) {
    return res.status(403).json({ error: 'forbidden', message: 'Forbidden' });
  }

  try {
    const service = createServiceClient();

    const [tenantsRes, profilesRes] = await Promise.all([
      service.from('tenants').select('*').order('created_at', { ascending: false }),
      service.from('user_profiles').select('id, tenant_id, email, full_name, role, mfa_enrolled_at'),
    ]);
    if (tenantsRes.error) throw tenantsRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const tenants = tenantsRes.data || [];
    const profiles = profilesRes.data || [];

    const { byTenant, sources } = await loadFirmBilling(service, tenants);

    // Derived from the key by the same helper the billing routes use, so a
    // restricted (rk_) or absent key cannot produce live dashboard links.
    const liveStripe = stripeEnvFromKey(process.env.STRIPE_SECRET_KEY) === 'live';

    const firms = tenants.map((tenant: any) => {
      const members = profiles.filter((p: any) => p.tenant_id === tenant.id);
      const admins = members.filter((p: any) => productRole(p.role) === 'administrator');
      const billing = byTenant[tenant.id];

      return {
        id: tenant.id,
        firm: tenant.name || tenant.slug || '(unnamed)',
        slug: tenant.slug || null,
        created_at: tenant.created_at || null,

        users: members.length,
        administrators: admins.length,
        // MFA is mandatory for Administrators, so an admin without it is a
        // compliance gap worth seeing from here.
        admins_without_mfa: admins.filter((p: any) => !p.mfa_enrolled_at).length,
        require_mfa_all_users: tenant.require_mfa_all_users === true,

        ...billing,
        stripe: stripeLinks(billing, liveStripe),
      };
    });

    return res.status(200).json({ firms, sources, stripe_mode: liveStripe ? 'live' : 'test' });
  } catch (err: any) {
    console.error('[admin/firms]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message });
  }
}
