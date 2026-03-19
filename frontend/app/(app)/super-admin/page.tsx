'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, Building2, DollarSign, FileCheck, BarChart3, 
  TrendingUp, ArrowLeft, Crown, RefreshCw, ChevronDown, ChevronUp,
  Clock, Briefcase
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
  user_count: number;
  users: { id: string; email: string; full_name: string; role: string; created_at: string }[];
  job_count: number;
  check_count: number;
  mrr: number;
}

interface Summary {
  totalTenants: number;
  totalUsers: number;
  totalJobs: number;
  totalChecks: number;
  mrr: number;
  arr: number;
  recentSignups: number;
  planBreakdown: Record<string, number>;
}

interface AdminData {
  summary: Summary;
  tenants: Tenant[];
}

const planColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  starter: 'bg-blue-50 text-blue-700',
  professional: 'bg-indigo-50 text-indigo-700',
  pro: 'bg-indigo-50 text-indigo-700',
  enterprise: 'bg-purple-50 text-purple-700',
};

const planLabels: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function StatCard({ icon: Icon, label, value, sub, color = 'text-blue-600' }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center ${color}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-black text-gray-900 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/stats');
      if (res.status === 403) {
        setError('Access denied. You are not a super admin.');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch');
      }
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Crown size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mx-auto">
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, tenants } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crown size={20} className="text-amber-500" />
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Super Admin Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500">Platform overview &mdash; all tenants, users, and revenue</p>
        </div>
        <button
          onClick={fetchData}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Revenue & Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={DollarSign} label="Monthly Revenue (MRR)" value={`$${summary.mrr.toLocaleString()}`} sub={`ARR: $${summary.arr.toLocaleString()}`} color="text-green-600" />
        <StatCard icon={Building2} label="Total Tenants" value={summary.totalTenants} sub={`${summary.recentSignups} in last 30d`} color="text-blue-600" />
        <StatCard icon={Users} label="Total Users" value={summary.totalUsers} color="text-indigo-600" />
        <StatCard icon={FileCheck} label="Total Checks Processed" value={summary.totalChecks.toLocaleString()} sub={`${summary.totalJobs} jobs`} color="text-violet-600" />
      </div>

      {/* Plan Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-8">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-gray-400" /> Plan Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(summary.planBreakdown).map(([plan, count]) => {
            const pricingMap: Record<string, number> = { free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299 };
            const revenue = count * (pricingMap[plan] || 0);
            return (
              <div key={plan} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${planColors[plan] || 'bg-gray-100 text-gray-600'}`}>
                    {planLabels[plan] || plan}
                  </span>
                </div>
                <div className="text-2xl font-black text-gray-900">{count}</div>
                <div className="text-xs text-gray-400">
                  {revenue > 0 ? `$${revenue}/mo revenue` : 'No revenue'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Briefcase size={16} className="text-gray-400" /> All Tenants ({tenants.length})
          </h3>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tenant</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="text-center py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Users</th>
                <th className="text-center py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jobs</th>
                <th className="text-center py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Checks</th>
                <th className="text-right py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">MRR</th>
                <th className="text-right py-3 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="py-3 px-5"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <>
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-5">
                      <div className="font-semibold text-gray-900">{t.name}</div>
                      <div className="text-xs text-gray-400">{t.slug}</div>
                    </td>
                    <td className="py-3 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${planColors[t.plan] || 'bg-gray-100 text-gray-600'}`}>
                        {planLabels[t.plan] || t.plan}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-center text-gray-600">{t.user_count}</td>
                    <td className="py-3 px-5 text-center text-gray-600">{t.job_count}</td>
                    <td className="py-3 px-5 text-center text-gray-600">{t.check_count}</td>
                    <td className="py-3 px-5 text-right font-semibold text-gray-900">${t.mrr}</td>
                    <td className="py-3 px-5 text-right text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-5">
                      <button onClick={() => setExpandedTenant(expandedTenant === t.id ? null : t.id)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                        {expandedTenant === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                  </tr>
                  {expandedTenant === t.id && (
                    <tr key={`${t.id}-details`}>
                      <td colSpan={8} className="bg-gray-50/80 px-5 py-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Users in {t.name}</div>
                        <div className="space-y-2">
                          {t.users.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">
                                {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{u.full_name || 'No name'}</div>
                                <div className="text-xs text-gray-400 truncate">{u.email}</div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                {u.role}
                              </span>
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock size={10} /> {new Date(u.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                          {t.users.length === 0 && (
                            <div className="text-xs text-gray-400 italic">No users found</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-50">
          {tenants.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.slug}</div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${planColors[t.plan] || 'bg-gray-100 text-gray-600'}`}>
                  {planLabels[t.plan] || t.plan}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-xs text-gray-400">Users</div>
                  <div className="text-sm font-bold text-gray-900">{t.user_count}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Jobs</div>
                  <div className="text-sm font-bold text-gray-900">{t.job_count}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">Checks</div>
                  <div className="text-sm font-bold text-gray-900">{t.check_count}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">MRR</div>
                  <div className="text-sm font-bold text-gray-900">${t.mrr}</div>
                </div>
              </div>
              <button
                onClick={() => setExpandedTenant(expandedTenant === t.id ? null : t.id)}
                className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-gray-900 flex items-center justify-center gap-1 border border-gray-100 rounded-lg"
              >
                {expandedTenant === t.id ? 'Hide' : 'Show'} Users
                {expandedTenant === t.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {expandedTenant === t.id && (
                <div className="mt-3 space-y-2">
                  {t.users.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 text-xs">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{u.email}</div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {tenants.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No tenants found</div>
        )}
      </div>
    </div>
  );
}
