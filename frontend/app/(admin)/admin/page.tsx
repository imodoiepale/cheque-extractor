'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users, DollarSign, FileCheck, TrendingUp,
  RefreshCw, Briefcase, Calendar, Filter
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const PLAN_COLORS: Record<string, string> = {
  free: '#6b7280', starter: '#3b82f6', professional: '#6366f1', pro: '#6366f1', enterprise: '#8b5cf6',
};
const PLAN_BADGES: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500', starter: 'bg-blue-50 text-blue-600',
  professional: 'bg-indigo-50 text-indigo-600', pro: 'bg-indigo-50 text-indigo-600',
  enterprise: 'bg-purple-50 text-purple-600',
};
const DATE_RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];
const TT = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, color: '#111' };
const AX = { fill: '#9ca3af', fontSize: 10 };

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color || 'bg-blue-50 text-blue-600'}`}><Icon size={18} /></div>
      </div>
      <div className="text-2xl font-black text-gray-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-gray-300 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [planFilter, setPlanFilter] = useState('all');

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/overview?days=${days}&plan=${planFilter}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days, planFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const plans = data?.summary?.planBreakdown ? ['all', ...Object.keys(data.summary.planBreakdown)] : ['all'];

  if (loading && !data) {
    return (<div className="flex items-center justify-center min-h-[60vh]"><RefreshCw size={24} className="animate-spin text-blue-500" /></div>);
  }
  if (!data?.summary) return <div className="p-8 text-gray-400">Failed to load data</div>;

  const { summary, charts, recentTenants, topTenants } = data;

  const planPieData = Object.entries(summary.planBreakdown || {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value, color: PLAN_COLORS[name] || '#6b7280',
  }));

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header + Shopify-style filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Overview</h1>
          <p className="text-sm text-gray-400 mt-1">Platform-wide metrics and trends</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range pills */}
          <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
            <Calendar size={14} className="text-gray-400 mx-2" />
            {DATE_RANGES.map(r => (
              <button key={r.value} onClick={() => setDays(r.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === r.value ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          {/* Plan filter */}
          <div className="flex items-center bg-white rounded-lg border border-gray-200 shadow-sm">
            <Filter size={14} className="text-gray-400 ml-2.5" />
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
              className="pl-2 pr-6 py-1.5 text-xs font-medium text-gray-600 bg-transparent border-none focus:outline-none focus:ring-0 appearance-none cursor-pointer">
              {plans.map(p => <option key={p} value={p}>{p === 'all' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          {loading && <RefreshCw size={14} className="animate-spin text-blue-500" />}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Monthly Revenue (MRR)" value={`$${summary.mrr.toLocaleString()}`} sub={`ARR: $${summary.arr.toLocaleString()}`} color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Building2} label="Total Accounts" value={summary.totalTenants} sub={`${summary.recentSignups} this week`} color="bg-blue-50 text-blue-600" />
        <StatCard icon={Users} label="Total Users" value={summary.totalUsers} color="bg-indigo-50 text-indigo-600" />
        <StatCard icon={FileCheck} label="Checks Processed" value={summary.totalChecks.toLocaleString()} sub={`${summary.totalJobs} jobs`} color="bg-violet-50 text-violet-600" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title={`MRR Growth (${days}d)`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.mrrByDay}>
                <defs><linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={AX} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
                <YAxis tick={AX} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [`$${v}`, 'MRR']} />
                <Area type="monotone" dataKey="mrr" stroke="#22c55e" fill="url(#mrrGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title={`New Signups (${days}d)`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.signupsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={AX} tickFormatter={v => days <= 30 ? v.slice(8) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
                <YAxis tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Signups" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title={`Checks Processed (${days}d)`}>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.checksByDay}>
                  <defs><linearGradient id="checksGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={AX} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
                  <YAxis tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#checksGrad)" strokeWidth={2} name="Checks" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
        <ChartCard title="Plan Distribution">
          <div className="h-[240px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {planPieData.map((entry: any, i: number) => (<Cell key={i} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={TT} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Tables */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={14} className="text-gray-400" /> Top Accounts by Usage</h3>
            <a href="/admin/tenants" className="text-[11px] text-blue-600 hover:text-blue-700">View all →</a>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {topTenants.map((t: any, i: number) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pl-5 pr-2 text-[10px] text-gray-300 font-mono w-8">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <a href={`/admin/tenants/${t.id}`} className="block">
                      <div className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors">{t.name}</div>
                      <div className="text-[10px] text-gray-400">{t.check_count} checks · {t.job_count} jobs</div>
                    </a>
                  </td>
                  <td className="py-3 px-2"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${PLAN_BADGES[t.plan] || PLAN_BADGES.free}`}>{t.plan}</span></td>
                  <td className="py-3 pr-5 text-right text-xs font-semibold text-emerald-600">${t.mrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topTenants.length === 0 && (<div className="px-5 py-6 text-center text-xs text-gray-300">No accounts yet</div>)}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Briefcase size={14} className="text-gray-400" /> Recent Signups (7 days)</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {recentTenants.map((t: any, i: number) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pl-5 pr-2 text-[10px] text-gray-300 font-mono w-8">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <a href={`/admin/tenants/${t.id}`} className="block">
                      <div className="text-sm font-medium text-gray-900">{t.name}</div>
                      <div className="text-[10px] text-gray-400">{t.users?.map((u: any) => u.email).join(', ') || 'No users'}</div>
                    </a>
                  </td>
                  <td className="py-3 px-2"><span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${PLAN_BADGES[t.plan] || PLAN_BADGES.free}`}>{t.plan}</span></td>
                  <td className="py-3 pr-5 text-right text-[10px] text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentTenants.length === 0 && (<div className="px-5 py-6 text-center text-xs text-gray-300">No signups this week</div>)}
        </div>
      </div>
    </div>
  );
}
