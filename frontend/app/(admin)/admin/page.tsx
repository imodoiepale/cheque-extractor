'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Users, DollarSign, FileCheck, TrendingUp,
  RefreshCw, Briefcase, Calendar, Filter
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import {
  Badge,
  GlassCard,
  GlassCardTitle,
  KpiTile,
  Table,
  Tbody,
  Td,
  Tr,
} from '@/components/ui';
import {
  areaFade,
  AXIS_TICK_SM,
  CHART_COLORS,
  ChartFrame,
  GRID_PROPS,
  NO_TWEEN,
  pieLabel,
  pieLabelLine,
  planColor,
  TOOLTIP_PROPS,
} from '@/lib/charts';

const DATE_RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

/** Plan is a tier, not a state, so it reads as an outline count, not a status. */
const planTone = (plan: string): 'neutral' | 'brand' => (plan === 'free' ? 'neutral' : 'brand');

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard padding="md">
      <GlassCardTitle className="mb-4 text-sm">{title}</GlassCardTitle>
      {children}
    </GlassCard>
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
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-brand" />
      </div>
    );
  }
  if (!data?.summary) return <div className="p-8 text-ink-body">Failed to load data</div>;

  const { summary, charts, recentTenants, topTenants } = data;

  const planPieData = Object.entries(summary.planBreakdown || {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value, color: planColor(name),
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Header + filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-eyebrow text-ink-faint">Super Admin</p>
          <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Overview</h1>
          <p className="mt-1 text-sm text-ink-body">Platform-wide metrics and trends</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range — one recessed track, thumb by background, like Tabs. */}
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
          {/* Plan filter */}
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          tone="success"
          icon={<DollarSign size={18} />}
          label="Monthly Revenue (MRR)"
          value={`$${summary.mrr.toLocaleString()}`}
          caption={`ARR: $${summary.arr.toLocaleString()}`}
        />
        <KpiTile
          tone="brand"
          icon={<Building2 size={18} />}
          label="Total Accounts"
          value={summary.totalTenants}
          caption={`${summary.recentSignups} this week`}
        />
        <KpiTile tone="brand" icon={<Users size={18} />} label="Total Users" value={summary.totalUsers} />
        <KpiTile
          tone="brand"
          icon={<FileCheck size={18} />}
          label="Checks Processed"
          value={summary.totalChecks.toLocaleString()}
          caption={`${summary.totalJobs} jobs`}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`MRR Growth (${days}d)`}>
          <ChartFrame height={240}>
            <AreaChart data={charts.mrrByDay}>
              {areaFade('adminMrrGrad', CHART_COLORS.emerald)}
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
              <YAxis tick={AXIS_TICK_SM} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v: any) => [`$${v}`, 'MRR']} />
              <Area {...NO_TWEEN} type="monotone" dataKey="mrr" stroke={CHART_COLORS.emerald} fill="url(#adminMrrGrad)" strokeWidth={2} />
            </AreaChart>
          </ChartFrame>
        </ChartCard>

        <ChartCard title={`New Signups (${days}d)`}>
          <ChartFrame height={240}>
            <BarChart data={charts.signupsByDay}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={v => days <= 30 ? v.slice(8) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
              <YAxis tick={AXIS_TICK_SM} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Bar {...NO_TWEEN} dataKey="count" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} name="Signups" />
            </BarChart>
          </ChartFrame>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title={`Checks Processed (${days}d)`}>
            <ChartFrame height={240}>
              <AreaChart data={charts.checksByDay}>
                {areaFade('adminChecksGrad', CHART_COLORS.brand)}
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={v => days <= 30 ? v.slice(5) : v.slice(2, 7)} axisLine={false} tickLine={false} interval={days > 90 ? 29 : undefined} />
                <YAxis tick={AXIS_TICK_SM} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Area {...NO_TWEEN} type="monotone" dataKey="count" stroke={CHART_COLORS.brand} fill="url(#adminChecksGrad)" strokeWidth={2} name="Checks" />
              </AreaChart>
            </ChartFrame>
          </ChartCard>
        </div>

        <ChartCard title="Plan Distribution">
          <ChartFrame height={240}>
            <PieChart>
              <Pie {...NO_TWEEN}
                data={planPieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="rgba(255,255,255,0.7)"
                labelLine={pieLabelLine}
                label={pieLabel}
              >
                {planPieData.map((entry: any, i: number) => (<Cell key={i} fill={entry.color} />))}
              </Pie>
              <Tooltip {...TOOLTIP_PROPS} />
            </PieChart>
          </ChartFrame>
        </ChartCard>
      </div>

      {/* Tables. Shared Td recipe: py-3 at text-sm, the same 44px row the
          pre-redesign tables had. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-glass-hairline px-5 py-4">
            <GlassCardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp size={14} className="text-ink-faint" /> Top Accounts by Usage
            </GlassCardTitle>
            <a href="/admin/tenants" className="text-xs font-medium text-brand-deep hover:underline">View all &rarr;</a>
          </div>
          <Table>
            <Tbody>
              {topTenants.map((t: any, i: number) => (
                <Tr key={t.id} interactive>
                  <Td muted className="w-8 pl-5 pr-2 font-mono text-xs">{i + 1}</Td>
                  <Td className="pr-4">
                    <a href={`/admin/tenants/${t.id}`} className="block">
                      <div className="text-sm font-medium text-ink-strong">{t.name}</div>
                      <div className="nums text-xs text-ink-faint">{t.check_count} checks &middot; {t.job_count} jobs</div>
                    </a>
                  </Td>
                  <Td className="px-2">
                    <Badge tone={planTone(t.plan)} size="sm" className="uppercase">{t.plan}</Badge>
                  </Td>
                  <Td numeric className="nums-money pr-5 text-sm font-semibold text-success-text">${t.mrr}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {topTenants.length === 0 && (<div className="px-5 py-6 text-center text-sm text-ink-faint">No accounts yet</div>)}
        </GlassCard>

        <GlassCard padding="none" className="overflow-hidden">
          <div className="border-b border-glass-hairline px-5 py-4">
            <GlassCardTitle className="flex items-center gap-2 text-sm">
              <Briefcase size={14} className="text-ink-faint" /> Recent Signups (7 days)
            </GlassCardTitle>
          </div>
          <Table>
            <Tbody>
              {recentTenants.map((t: any, i: number) => (
                <Tr key={t.id} interactive>
                  <Td muted className="w-8 pl-5 pr-2 font-mono text-xs">{i + 1}</Td>
                  <Td className="pr-4">
                    <a href={`/admin/tenants/${t.id}`} className="block">
                      <div className="text-sm font-medium text-ink-strong">{t.name}</div>
                      <div className="truncate text-xs text-ink-faint">{t.users?.map((u: any) => u.email).join(', ') || 'No users'}</div>
                    </a>
                  </Td>
                  <Td className="px-2">
                    <Badge tone={planTone(t.plan)} size="sm" className="uppercase">{t.plan}</Badge>
                  </Td>
                  <Td numeric muted className="pr-5 text-xs">{new Date(t.created_at).toLocaleDateString()}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {recentTenants.length === 0 && (<div className="px-5 py-6 text-center text-sm text-ink-faint">No signups this week</div>)}
        </GlassCard>
      </div>
    </div>
  );
}
