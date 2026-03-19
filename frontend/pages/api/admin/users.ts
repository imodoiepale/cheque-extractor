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

  try {
    const [profilesRes, tenantsRes, jobsRes] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('id, tenant_id, email, full_name, role, created_at').order('created_at', { ascending: false }),
      supabaseAdmin.from('tenants').select('id, name, plan'),
      supabaseAdmin.from('check_jobs').select('id, user_id, tenant_id, created_at'),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (tenantsRes.error) throw tenantsRes.error;

    const profiles = profilesRes.data || [];
    const tenants = tenantsRes.data || [];
    const jobs = jobsRes.data || [];

    const enriched = profiles.map((p) => {
      const tenant = tenants.find(t => t.id === p.tenant_id);
      const userJobs = jobs.filter(j => j.user_id === p.id);
      const lastActivity = userJobs.length > 0
        ? userJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : p.created_at;

      return {
        ...p,
        tenant_name: tenant?.name || 'Unknown',
        tenant_plan: tenant?.plan || 'free',
        job_count: userJobs.length,
        last_activity: lastActivity,
      };
    });

    return res.status(200).json({ users: enriched });
  } catch (err: any) {
    console.error('[ADMIN/users]', err);
    return res.status(500).json({ error: err.message });
  }
}
