'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, ChevronRight, Mail } from 'lucide-react';

const planColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500',
  starter: 'bg-blue-50 text-blue-600',
  professional: 'bg-indigo-50 text-indigo-600',
  pro: 'bg-indigo-50 text-indigo-600',
  enterprise: 'bg-purple-50 text-purple-600',
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'check_count' | 'mrr' | 'user_count'>('created_at');

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(r => r.json())
      .then(d => setTenants(d.tenants || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = tenants;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.users?.some((u: any) => u.email.toLowerCase().includes(q))
      );
    }
    if (planFilter !== 'all') {
      result = result.filter(t => t.plan === planFilter);
    }
    result.sort((a, b) => {
      if (sortBy === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
    return result;
  }, [tenants, search, planFilter, sortBy]);

  const plans = useMemo(() => {
    const set = new Set(tenants.map(t => t.plan));
    return ['all', ...Array.from(set)];
  }, [tenants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Accounts</h1>
        <p className="text-sm text-gray-400 mt-1">{tenants.length} accounts on the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search accounts, emails..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          {plans.map(p => (<option key={p} value={p}>{p === 'all' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
          <option value="created_at">Newest First</option>
          <option value="check_count">Most Checks</option>
          <option value="mrr">Highest MRR</option>
          <option value="user_count">Most Users</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Total</div>
          <div className="text-xl font-black text-gray-900">{filtered.length}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Users</div>
          <div className="text-xl font-black text-gray-900">{filtered.reduce((s, t) => s + t.user_count, 0)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Checks</div>
          <div className="text-xl font-black text-gray-900">{filtered.reduce((s, t) => s + t.check_count, 0).toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">MRR</div>
          <div className="text-xl font-black text-emerald-600">${filtered.reduce((s, t) => s + t.mrr, 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-center py-3 px-2 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Account / Email</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="text-center py-3 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jobs</th>
                <th className="text-center py-3 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Checks</th>
                <th className="text-right py-3 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">MRR</th>
                <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Joined</th>
                <th className="py-3 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((t, idx) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="py-3 px-2 text-center text-[10px] text-gray-300 font-mono">{idx + 1}</td>
                  <td className="py-3 px-4">
                    <Link href={`/admin/tenants/${t.id}`} className="block">
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{t.name}</div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                        <Mail size={9} />
                        {t.users?.length > 0 ? t.users.map((u: any) => u.email).join(', ') : t.slug}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${planColors[t.plan] || planColors.free}`}>{t.plan}</span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-500">{t.job_count}</td>
                  <td className="py-3 px-3 text-center text-gray-500">{t.check_count}</td>
                  <td className="py-3 px-3 text-right font-semibold text-emerald-600">${t.mrr}</td>
                  <td className="py-3 px-4 text-right text-[11px] text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-2">
                    <Link href={`/admin/tenants/${t.id}`} className="p-1 hover:bg-gray-100 rounded transition-colors inline-flex">
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No accounts match your filters</div>
        )}
      </div>
    </div>
  );
}
