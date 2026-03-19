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
  if (!user || !isSuperAdmin(user.email)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.query; // optional: fetch single tenant detail

  try {
    const pricing: Record<string, number> = { free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299 };

    if (id && typeof id === 'string') {
      // Single tenant detail
      const [tenantRes, profilesRes, jobsRes, checksRes] = await Promise.all([
        supabaseAdmin.from('tenants').select('*').eq('id', id).single(),
        supabaseAdmin.from('user_profiles').select('*').eq('tenant_id', id).order('created_at', { ascending: false }),
        supabaseAdmin.from('check_jobs').select('id, job_id, pdf_name, status, total_checks, created_at, completed_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(50),
        supabaseAdmin.from('checks').select('id, check_number, payee, amount, check_date, status, created_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(100),
      ]);

      if (tenantRes.error) throw tenantRes.error;
      if (profilesRes.error) console.error('[ADMIN] profiles error:', profilesRes.error);
      if (jobsRes.error) console.error('[ADMIN] jobs error:', jobsRes.error);
      if (checksRes.error) console.error('[ADMIN] checks error:', checksRes.error);

      // Non-blocking secondary queries
      let integrations: any[] = [];
      let qbEntries: any[] = [];
      try {
        const [intRes, qbRes] = await Promise.all([
          supabaseAdmin.from('integrations').select('id, provider, company_name, realm_id, status, created_at').eq('tenant_id', id),
          supabaseAdmin.from('qb_entries').select('id, qb_type, qb_source, check_number, date, amount, payee, account, memo, synced_at').eq('tenant_id', id).order('date', { ascending: false }).limit(200),
        ]);
        integrations = intRes.data || [];
        qbEntries = qbRes.data || [];
      } catch (e) {
        console.error('[ADMIN] secondary queries error:', e);
      }

      const tenant = tenantRes.data;
      const profiles = profilesRes.data || [];
      const jobs = jobsRes.data || [];
      const checks = checksRes.data || [];

      // Activity by day (last 30 days)
      const now = new Date();
      const activityByDay: Record<string, { jobs: number; checks: number }> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        activityByDay[d.toISOString().split('T')[0]] = { jobs: 0, checks: 0 };
      }
      jobs.forEach((j) => {
        const day = new Date(j.created_at).toISOString().split('T')[0];
        if (activityByDay[day]) activityByDay[day].jobs++;
      });
      checks.forEach((c) => {
        const day = new Date(c.created_at).toISOString().split('T')[0];
        if (activityByDay[day]) activityByDay[day].checks++;
      });

      // Check status breakdown
      const checkStatuses: Record<string, number> = {};
      checks.forEach((c) => { checkStatuses[c.status] = (checkStatuses[c.status] || 0) + 1; });

      return res.status(200).json({
        tenant: {
          ...tenant,
          mrr: pricing[tenant.plan] || 0,
        },
        profiles,
        jobs,
        checks,
        integrations,
        qbEntries,
        checkStatuses,
        activityByDay: Object.entries(activityByDay).map(([date, data]) => ({ date, ...data })),
      });
    }

    // All tenants list
    const [tenantsRes, profilesRes, jobsRes, checksRes] = await Promise.all([
      supabaseAdmin.from('tenants').select('id, name, slug, plan, created_at, updated_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('user_profiles').select('id, tenant_id, email, full_name, role, created_at'),
      supabaseAdmin.from('check_jobs').select('id, tenant_id'),
      supabaseAdmin.from('checks').select('id, tenant_id'),
    ]);

    if (tenantsRes.error) throw tenantsRes.error;

    const tenants = tenantsRes.data || [];
    const profiles = profilesRes.data || [];
    const jobs = jobsRes.data || [];
    const checks = checksRes.data || [];

    const enriched = tenants.map((t) => ({
      ...t,
      user_count: profiles.filter(p => p.tenant_id === t.id).length,
      job_count: jobs.filter(j => j.tenant_id === t.id).length,
      check_count: checks.filter(c => c.tenant_id === t.id).length,
      mrr: pricing[t.plan] || 0,
      users: profiles.filter(p => p.tenant_id === t.id),
    }));

    return res.status(200).json({ tenants: enriched });
  } catch (err: any) {
    console.error('[ADMIN/tenants]', err);
    return res.status(500).json({ error: err.message });
  }
}
