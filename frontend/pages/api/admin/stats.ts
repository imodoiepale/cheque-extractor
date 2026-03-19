import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '@/lib/super-admin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via cookie
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
  if (!user || !isSuperAdmin(user.email)) {
    return res.status(403).json({ error: 'Forbidden: Super admin access required' });
  }

  try {
    // Fetch all tenants with their plan info
    const { data: tenants, error: tenantsError } = await supabaseAdmin
      .from('tenants')
      .select('id, name, slug, plan, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (tenantsError) throw tenantsError;

    // Fetch all profiles with tenant info
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, tenant_id, email, full_name, role, created_at')
      .order('created_at', { ascending: false });

    if (profilesError) throw profilesError;

    // Fetch check job counts per tenant
    const { data: jobStats, error: jobsError } = await supabaseAdmin
      .from('check_jobs')
      .select('tenant_id, status');

    if (jobsError) throw jobsError;

    // Fetch check counts per tenant
    const { data: checkStats, error: checksError } = await supabaseAdmin
      .from('checks')
      .select('tenant_id, status');

    if (checksError) throw checksError;

    // Pricing map
    const planPricing: Record<string, number> = {
      free: 0,
      starter: 49,
      professional: 129,
      pro: 129,
      enterprise: 299,
    };

    // Aggregate stats
    const totalTenants = tenants?.length || 0;
    const totalUsers = profiles?.length || 0;
    const totalJobs = jobStats?.length || 0;
    const totalChecks = checkStats?.length || 0;

    // Plan breakdown
    const planBreakdown: Record<string, number> = {};
    tenants?.forEach((t) => {
      planBreakdown[t.plan] = (planBreakdown[t.plan] || 0) + 1;
    });

    // Monthly Recurring Revenue (MRR)
    const mrr = tenants?.reduce((sum, t) => sum + (planPricing[t.plan] || 0), 0) || 0;

    // Enrich tenants with user count and usage
    const enrichedTenants = tenants?.map((t) => {
      const tenantUsers = profiles?.filter((p) => p.tenant_id === t.id) || [];
      const tenantJobs = jobStats?.filter((j) => j.tenant_id === t.id) || [];
      const tenantChecks = checkStats?.filter((c) => c.tenant_id === t.id) || [];
      return {
        ...t,
        user_count: tenantUsers.length,
        users: tenantUsers,
        job_count: tenantJobs.length,
        check_count: tenantChecks.length,
        mrr: planPricing[t.plan] || 0,
      };
    });

    // Signups over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSignups = tenants?.filter(
      (t) => new Date(t.created_at) >= thirtyDaysAgo
    ).length || 0;

    return res.status(200).json({
      summary: {
        totalTenants,
        totalUsers,
        totalJobs,
        totalChecks,
        mrr,
        arr: mrr * 12,
        recentSignups,
        planBreakdown,
      },
      tenants: enrichedTenants,
    });
  } catch (err: any) {
    console.error('[ADMIN] Error fetching stats:', err);
    return res.status(500).json({ error: err.message });
  }
}
