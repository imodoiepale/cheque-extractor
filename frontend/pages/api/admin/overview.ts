import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { isSuperAdmin } from '@/lib/super-admin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user || !isSuperAdmin(user.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Date range filter: 7d, 30d, 90d, 365d (default 30d)
  const days = parseInt(req.query.days as string) || 30;
  const planFilter = (req.query.plan as string) || 'all';

  try {
    const [tenantsRes, profilesRes, jobsRes, checksRes] = await Promise.all([
      supabaseAdmin.from('tenants').select('id, name, slug, plan, created_at'),
      supabaseAdmin.from('user_profiles').select('id, tenant_id, email, full_name, role, created_at'),
      supabaseAdmin.from('check_jobs').select('id, tenant_id, status, created_at, total_checks'),
      supabaseAdmin.from('checks').select('id, tenant_id, status, created_at'),
    ]);

    if (tenantsRes.error) throw tenantsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (jobsRes.error) throw jobsRes.error;
    if (checksRes.error) throw checksRes.error;

    const allTenants = tenantsRes.data || [];
    const profiles = profilesRes.data || [];
    const jobs = jobsRes.data || [];
    const checks = checksRes.data || [];

    const pricing: Record<string, number> = { free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299 };

    // Apply plan filter
    const tenants = planFilter !== 'all' ? allTenants.filter(t => t.plan === planFilter) : allTenants;
    const tenantIds = new Set(tenants.map(t => t.id));
    const filteredJobs = jobs.filter(j => tenantIds.has(j.tenant_id));
    const filteredChecks = checks.filter(c => tenantIds.has(c.tenant_id));

    // Plan breakdown (always from all tenants)
    const planBreakdown: Record<string, number> = {};
    allTenants.forEach((t) => { planBreakdown[t.plan] = (planBreakdown[t.plan] || 0) + 1; });

    const mrr = tenants.reduce((s, t) => s + (pricing[t.plan] || 0), 0);

    // Build day-by-day charts using `days` param
    const now = new Date();
    function buildDayMap(count: number): Record<string, number> {
      const m: Record<string, number> = {};
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        m[d.toISOString().split('T')[0]] = 0;
      }
      return m;
    }

    const signupsByDay = buildDayMap(days);
    tenants.forEach((t) => { const d = new Date(t.created_at).toISOString().split('T')[0]; if (signupsByDay[d] !== undefined) signupsByDay[d]++; });

    const jobsByDay = buildDayMap(days);
    filteredJobs.forEach((j) => { const d = new Date(j.created_at).toISOString().split('T')[0]; if (jobsByDay[d] !== undefined) jobsByDay[d]++; });

    const checksByDay = buildDayMap(days);
    filteredChecks.forEach((c) => { const d = new Date(c.created_at).toISOString().split('T')[0]; if (checksByDay[d] !== undefined) checksByDay[d]++; });

    // MRR growth (cumulative)
    const mrrByDay: Record<string, number> = {};
    const sortedTenants = [...tenants].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - days);
    let cumulativeMrr = sortedTenants.filter(t => new Date(t.created_at) < rangeStart).reduce((s, t) => s + (pricing[t.plan] || 0), 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      cumulativeMrr += sortedTenants.filter(t => new Date(t.created_at).toISOString().split('T')[0] === dayStr).reduce((s, t) => s + (pricing[t.plan] || 0), 0);
      mrrByDay[dayStr] = cumulativeMrr;
    }

    // Check status breakdown
    const checkStatuses: Record<string, number> = {};
    filteredChecks.forEach((c) => { checkStatuses[c.status] = (checkStatuses[c.status] || 0) + 1; });

    // Recent signups
    const sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);
    const recentTenants = tenants
      .filter(t => new Date(t.created_at) >= sevenAgo)
      .map(t => ({ ...t, users: profiles.filter(p => p.tenant_id === t.id), mrr: pricing[t.plan] || 0 }));

    // Top tenants by usage
    const topTenants = tenants
      .map(t => ({
        id: t.id, name: t.name, plan: t.plan,
        user_count: profiles.filter(p => p.tenant_id === t.id).length,
        job_count: filteredJobs.filter(j => j.tenant_id === t.id).length,
        check_count: filteredChecks.filter(c => c.tenant_id === t.id).length,
        mrr: pricing[t.plan] || 0,
      }))
      .sort((a, b) => b.check_count - a.check_count)
      .slice(0, 10);

    return res.status(200).json({
      days,
      planFilter,
      summary: {
        totalTenants: tenants.length,
        totalUsers: profiles.filter(p => tenantIds.has(p.tenant_id)).length,
        totalJobs: filteredJobs.length,
        totalChecks: filteredChecks.length,
        mrr, arr: mrr * 12,
        recentSignups: recentTenants.length,
        planBreakdown,
        checkStatuses,
      },
      charts: {
        signupsByDay: Object.entries(signupsByDay).map(([date, count]) => ({ date, count })),
        jobsByDay: Object.entries(jobsByDay).map(([date, count]) => ({ date, count })),
        checksByDay: Object.entries(checksByDay).map(([date, count]) => ({ date, count })),
        mrrByDay: Object.entries(mrrByDay).map(([date, mrr]) => ({ date, mrr })),
      },
      recentTenants,
      topTenants,
    });
  } catch (err: any) {
    console.error('[ADMIN/overview]', err);
    return res.status(500).json({ error: err.message });
  }
}
