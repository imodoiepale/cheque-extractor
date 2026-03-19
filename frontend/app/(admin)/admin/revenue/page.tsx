'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign, RefreshCw, Calendar, Filter
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line
} from 'recharts';

const PLAN_COLORS: Record<string, string> = {
  free: '#6b7280', starter: '#3b82f6', professional: '#6366f1', pro: '#6366f1', enterprise: '#8b5cf6',
};
const PLAN_PRICING: Record<string, number> = {
  free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299,
};
const DATE_RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];
const TT = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, color: '#111' };
const AX = { fill: '#9ca3af', fontSize: 10 };

export default function AdminRevenuePage() {
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

  const revenueByPlan = useMemo(() => {
    if (!data?.summary?.planBreakdown) return [];
    return Object.entries(data.summary.planBreakdown).map(([plan, count]) => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1),
      tenants: count as number,
      mrr: (count as number) * (PLAN_PRICING[plan] || 0),
      color: PLAN_COLORS[plan] || '#6b7280',
    }));
  }, [data]);

  const totalMrr = revenueByPlan.reduce((s, r) => s + r.mrr, 0);

  // Revenue waterfall data
  const waterfallData = useMemo(() => {
    return revenueByPlan.map(r => ({
      name: r.plan,
      revenue: r.mrr,
      fill: r.color,
    }));
  }, [revenueByPlan]);

  if (loading && !data) {
    return (<div className="flex items-center justify-center min-h-[60vh]"><RefreshCw size={24} className="animate-spin text-blue-500" /></div>);
  }
  if (!data?.summary) return <div className="p-8 text-gray-400">Failed to load data</div>;

  const { summary, charts } = data;
  const arpu = summary.totalTenants > 0 ? Math.round(summary.mrr / summary.totalTenants) : 0;
  const paidTenants = summary.totalTenants - (summary.planBreakdown?.free || 0);
  const paidArpu = paidTenants > 0 ? Math.round(summary.mrr / paidTenants) : 0;
  const conversionRate = summary.totalTenants > 0 ? Math.round((paidTenants / summary.totalTenants) * 100) : 0;

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Revenue & Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Financial metrics and growth analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
            <Calendar size={14} className="text-gray-400 mx-2" />
            {DATE_RANGES.map(r => (
              <button key={r.value} onClick={() => setDays(r.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === r.value ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
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
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">MRR</div>
          <div className="text-2xl font-black text-emerald-600">${summary.mrr.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">ARR</div>
          <div className="text-2xl font-black text-emerald-600">${summary.arr.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">ARPU</div>
          <div className="text-2xl font-black text-gray-900">${arpu}</div>
          <div className="text-[9px] text-gray-400">all tenants</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Paid ARPU</div>
          <div className="text-2xl font-black text-gray-900">${paidArpu}</div>
          <div className="text-[9px] text-gray-400">paid only</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Paid Tenants</div>
          <div className="text-2xl font-black text-gray-900">{paidTenants}</div>
          <div className="text-[9px] text-gray-400">of {summary.totalTenants}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Conversion</div>
          <div className="text-2xl font-black text-blue-600">{conversionRate}%</div>
          <div className="text-[9px] text-gray-400">free → paid</div>
        </div>
      </div>

      {/* MRR Growth Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">MRR Growth ({days}d)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.mrrByDay}>
              <defs>
                <linearGradient id="revMrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={AX} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
              <YAxis tick={AX} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`$${v}`, 'MRR']} />
              <Area type="monotone" dataKey="mrr" stroke="#22c55e" fill="url(#revMrrGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue by Plan + Signups Trend */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue by Plan */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Plan</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={AX} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [`$${v}/mo`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution Donut */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Plan Distribution (by Revenue)</h3>
          <div className="h-[260px] flex items-center">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={revenueByPlan} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="mrr">
                    {revenueByPlan.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v: any) => [`$${v}/mo`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 space-y-3 pl-4">
              {revenueByPlan.map((r) => (
                <div key={r.plan} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900">{r.plan}</div>
                    <div className="text-[10px] text-gray-400">{r.tenants} tenants</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-600">${r.mrr}</div>
                    <div className="text-[9px] text-gray-400">{totalMrr > 0 ? Math.round((r.mrr / totalMrr) * 100) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Signups + Checks Correlation */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Signups vs Check Processing ({days}d)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={charts.signupsByDay?.map((s: any, i: number) => ({
              date: s.date,
              signups: s.count,
              checks: charts.checksByDay?.[i]?.count || 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={AX} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
              <YAxis yAxisId="left" tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Bar yAxisId="left" dataKey="signups" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Signups" opacity={0.7} />
              <Line yAxisId="right" type="monotone" dataKey="checks" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Checks" />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Revenue Breakdown by Plan</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-center py-3 px-2 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
              <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Plan</th>
              <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Price</th>
              <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Accounts</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">MRR</th>
              <th className="text-right py-3 px-5 text-[10px] font-bold text-gray-400 uppercase">ARR</th>
              <th className="text-right py-3 px-5 text-[10px] font-bold text-gray-400 uppercase">% of Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {revenueByPlan.map((r, i) => (
              <tr key={r.plan} className="hover:bg-gray-50">
                <td className="py-3 px-2 text-center text-[10px] text-gray-300 font-mono">{i + 1}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                    <span className="font-medium text-gray-900">{r.plan}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center text-gray-500">${PLAN_PRICING[r.plan.toLowerCase()] || 0}/mo</td>
                <td className="py-3 px-4 text-center text-gray-500">{r.tenants}</td>
                <td className="py-3 px-4 text-right font-semibold text-emerald-600">${r.mrr.toLocaleString()}</td>
                <td className="py-3 px-5 text-right text-gray-700">${(r.mrr * 12).toLocaleString()}</td>
                <td className="py-3 px-5 text-right text-gray-400">{totalMrr > 0 ? Math.round((r.mrr / totalMrr) * 100) : 0}%</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold">
              <td className="py-3 px-2"></td>
              <td className="py-3 px-4 text-gray-900">Total</td>
              <td className="py-3 px-4"></td>
              <td className="py-3 px-4 text-center text-gray-900">{summary.totalTenants}</td>
              <td className="py-3 px-4 text-right text-emerald-600">${totalMrr.toLocaleString()}</td>
              <td className="py-3 px-5 text-right text-gray-900">${(totalMrr * 12).toLocaleString()}</td>
              <td className="py-3 px-5 text-right text-gray-900">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
