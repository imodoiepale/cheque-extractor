'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Calendar, Filter } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ComposedChart, Line
} from 'recharts';
import {
  GlassCard,
  GlassCardTitle,
  KpiTile,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import {
  areaFade,
  AXIS_TICK,
  AXIS_TICK_SM,
  CHART_COLORS,
  ChartFrame,
  GRID_PROPS,
  NO_TWEEN,
  LEGEND_STYLE,
  planColor,
  TOOLTIP_PROPS,
} from '@/lib/charts';

const PLAN_PRICING: Record<string, number> = {
  free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299,
};
const DATE_RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

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
      color: planColor(plan),
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
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-brand" />
      </div>
    );
  }
  if (!data?.summary) return <div className="p-8 text-ink-body">Failed to load data</div>;

  const { summary, charts } = data;
  const arpu = summary.totalTenants > 0 ? Math.round(summary.mrr / summary.totalTenants) : 0;
  const paidTenants = summary.totalTenants - (summary.planBreakdown?.free || 0);
  const paidArpu = paidTenants > 0 ? Math.round(summary.mrr / paidTenants) : 0;
  const conversionRate = summary.totalTenants > 0 ? Math.round((paidTenants / summary.totalTenants) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Header + filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-eyebrow text-ink-faint">Super Admin</p>
          <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Revenue</h1>
          <p className="mt-1 text-sm text-ink-body">Financial metrics and growth analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass-track flex items-center rounded-pill p-1">
            <Calendar size={14} className="mx-2 text-ink-faint" />
            {DATE_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`press rounded-pill px-3 py-1.5 text-xs font-medium ${
                  days === r.value
                    ? 'bg-white/80 font-semibold text-brand-deep shadow-contact'
                    : 'text-ink-body hover:text-ink-strong'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="glass-card flex items-center rounded-pill">
            <Filter size={14} className="ml-3 text-ink-faint" />
            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              aria-label="Filter by plan"
              className="cursor-pointer appearance-none border-none bg-transparent py-2 pl-2 pr-6 text-xs font-medium text-ink-body focus:outline-none focus:ring-0"
            >
              {plans.map(p => <option key={p} value={p}>{p === 'all' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          {loading && <RefreshCw size={14} className="animate-spin text-brand" />}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile tone="success" label="MRR" value={`$${summary.mrr.toLocaleString()}`} />
        <KpiTile tone="success" label="ARR" value={`$${summary.arr.toLocaleString()}`} />
        <KpiTile label="ARPU" value={`$${arpu}`} caption="all tenants" />
        <KpiTile label="Paid ARPU" value={`$${paidArpu}`} caption="paid only" />
        <KpiTile label="Paid Tenants" value={paidTenants} caption={`of ${summary.totalTenants}`} />
        <KpiTile tone="brand" label="Conversion" value={`${conversionRate}%`} caption="free &rarr; paid" />
      </div>

      {/* MRR growth */}
      <GlassCard padding="md">
        <GlassCardTitle className="mb-4 text-sm">MRR Growth ({days}d)</GlassCardTitle>
        <ChartFrame height={300}>
          <AreaChart data={charts.mrrByDay}>
            {areaFade('revMrrGrad', CHART_COLORS.emerald)}
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
            <YAxis tick={AXIS_TICK_SM} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP_PROPS} formatter={(v: any) => [`$${v}`, 'MRR']} />
            <Area {...NO_TWEEN} type="monotone" dataKey="mrr" stroke={CHART_COLORS.emerald} fill="url(#revMrrGrad)" strokeWidth={2} />
          </AreaChart>
        </ChartFrame>
      </GlassCard>

      {/* Revenue by plan + distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard padding="md">
          <GlassCardTitle className="mb-4 text-sm">Revenue by Plan</GlassCardTitle>
          <ChartFrame height={260}>
            <BarChart data={waterfallData} layout="vertical">
              {/* Vertical bars read against a vertical grid, so this is the one
                  chart where the grid runs the other way. */}
              <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={AXIS_TICK} axisLine={false} tickLine={false} width={100} />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v: any) => [`$${v}/mo`, 'Revenue']} />
              <Bar {...NO_TWEEN} dataKey="revenue" radius={[0, 6, 6, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
        </GlassCard>

        <GlassCard padding="md">
          <GlassCardTitle className="mb-4 text-sm">Plan Distribution (by Revenue)</GlassCardTitle>
          <div className="flex h-[260px] items-center">
            <div className="w-1/2">
              <ChartFrame height={260}>
                <PieChart>
                  <Pie {...NO_TWEEN}
                    data={revenueByPlan}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="mrr"
                    stroke="rgba(255,255,255,0.7)"
                  >
                    {revenueByPlan.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: any) => [`$${v}/mo`, 'Revenue']} />
                </PieChart>
              </ChartFrame>
            </div>
            <div className="w-1/2 space-y-3 pl-4">
              {revenueByPlan.map((r) => (
                <div key={r.plan} className="flex items-center gap-3">
                  <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-ink-strong">{r.plan}</div>
                    <div className="nums text-xs text-ink-faint">{r.tenants} tenants</div>
                  </div>
                  <div className="text-right">
                    <div className="nums text-xs font-semibold text-success-text">${r.mrr}</div>
                    <div className="nums text-xs text-ink-faint">{totalMrr > 0 ? Math.round((r.mrr / totalMrr) * 100) : 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Signups vs checks */}
      <GlassCard padding="md">
        <GlassCardTitle className="mb-4 text-sm">Signups vs Check Processing ({days}d)</GlassCardTitle>
        <ChartFrame height={300}>
          <ComposedChart data={charts.signupsByDay?.map((s: any, i: number) => ({
            date: s.date,
            signups: s.count,
            checks: charts.checksByDay?.[i]?.count || 0,
          }))}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
            <YAxis yAxisId="left" tick={AXIS_TICK_SM} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK_SM} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar {...NO_TWEEN} yAxisId="left" dataKey="signups" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} name="Signups" opacity={0.75} />
            <Line {...NO_TWEEN} yAxisId="right" type="monotone" dataKey="checks" stroke={CHART_COLORS.emerald} strokeWidth={2} dot={false} name="Checks" />
            <Legend wrapperStyle={LEGEND_STYLE} />
          </ComposedChart>
        </ChartFrame>
      </GlassCard>

      {/* Revenue table. Shared Td recipe — py-3, the pre-redesign row height. */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="border-b border-glass-hairline px-5 py-4">
          <GlassCardTitle className="text-sm">Revenue Breakdown by Plan</GlassCardTitle>
        </div>
        <Table>
          <Thead>
            <Tr>
              <Th className="w-10 px-2 text-center">#</Th>
              <Th>Plan</Th>
              <Th numeric>Price</Th>
              <Th numeric>Accounts</Th>
              <Th numeric>MRR</Th>
              <Th numeric>ARR</Th>
              <Th numeric>% of Revenue</Th>
            </Tr>
          </Thead>
          <Tbody>
            {revenueByPlan.map((r, i) => (
              <Tr key={r.plan} interactive>
                <Td muted className="px-2 text-center font-mono text-xs">{i + 1}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: r.color }} />
                    <span className="font-medium text-ink-strong">{r.plan}</span>
                  </div>
                </Td>
                <Td numeric className="nums-money">${PLAN_PRICING[r.plan.toLowerCase()] || 0}/mo</Td>
                <Td numeric>{r.tenants}</Td>
                <Td numeric className="nums-money font-semibold text-success-text">${r.mrr.toLocaleString()}</Td>
                <Td numeric className="nums-money">${(r.mrr * 12).toLocaleString()}</Td>
                <Td numeric muted className="nums-money">{totalMrr > 0 ? Math.round((r.mrr / totalMrr) * 100) : 0}%</Td>
              </Tr>
            ))}
            {/* Totals: an opaque band, never a third blurred surface. */}
            <Tr className="bg-surface/95 font-semibold">
              <Td className="px-2" />
              <Td className="text-ink-strong">Total</Td>
              <Td />
              <Td numeric className="nums-money text-ink-strong">{summary.totalTenants}</Td>
              <Td numeric className="nums-money text-success-text">${totalMrr.toLocaleString()}</Td>
              <Td numeric className="nums-money text-ink-strong">${(totalMrr * 12).toLocaleString()}</Td>
              <Td numeric className="nums-money text-ink-strong">100%</Td>
            </Tr>
          </Tbody>
        </Table>
      </GlassCard>
    </div>
  );
}
