'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, FileCheck, Briefcase, DollarSign,
  RefreshCw, Clock, Mail, Globe
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import {
  Badge,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  IconButton,
  KpiTile,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import {
  AXIS_TICK_SM,
  CHART_COLORS,
  ChartEmpty,
  ChartFrame,
  GRID_PROPS,
  NO_TWEEN,
  pieLabel,
  pieLabelLine,
  statusColor,
  TOOLTIP_PROPS,
} from '@/lib/charts';

/** Plan is a tier, not a state. Free reads neutral, everything paid reads brand. */
const planTone = (plan: string): 'neutral' | 'brand' => (plan === 'free' ? 'neutral' : 'brand');

const jobTone = (status: string) =>
  status === 'complete' ? 'success' : status === 'error' ? 'error' : 'warning';

const checkTone = (status: string) =>
  status === 'approved' ? 'success'
    : status === 'exported' ? 'brand'
    : status === 'rejected' ? 'error'
    : 'warning';

/**
 * The QB entries table is a dense read-only log, not a working grid: it ran
 * py-2.5 (~40px rows) before the redesign where the other tables ran py-3
 * (~44px). Declared once here so the two densities never drift apart and the
 * shared `tdVariants` stays untouched.
 */
const DENSE_LOG = '[&_td]:py-2.5';

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'jobs' | 'checks' | 'qb'>('overview');

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/admin/tenants?id=${params.id}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-brand" />
      </div>
    );
  }

  if (!data?.tenant) return <div className="p-8 text-ink-body">Tenant not found</div>;

  const { tenant, profiles, jobs, checks, integrations, qbEntries, checkStatuses, activityByDay } = data;

  const statusPieData = Object.entries(checkStatuses || {}).map(([name, value]) => ({
    name: name.replace(/_/g, ' '), value, color: statusColor(name),
  }));

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'users', label: 'Users', count: profiles?.length || 0 },
    { value: 'jobs', label: 'Jobs', count: jobs?.length || 0 },
    { value: 'checks', label: 'Checks', count: checks?.length || 0 },
    { value: 'qb', label: 'QB Data', count: qbEntries?.length || 0 },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <IconButton
          size="icon-sm"
          aria-label="Back to accounts"
          onClick={() => router.push('/admin/tenants')}
          className="mt-1"
        >
          <ArrowLeft size={16} />
        </IconButton>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">{tenant.name}</h1>
            <Badge tone={planTone(tenant.plan)} size="sm" className="uppercase">{tenant.plan}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-ink-faint">
            <span className="flex items-center gap-1"><Globe size={11} /> {tenant.slug}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Joined {new Date(tenant.created_at).toLocaleDateString()}</span>
            <span className="nums flex items-center gap-1"><DollarSign size={11} /> ${tenant.mrr}/mo</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile tone="brand" icon={<Users size={16} />} label="Users" value={profiles?.length || 0} />
        <KpiTile tone="brand" icon={<Briefcase size={16} />} label="Jobs" value={jobs?.length || 0} />
        <KpiTile tone="brand" icon={<FileCheck size={16} />} label="Checks" value={checks?.length || 0} />
        <KpiTile tone="brand" icon={<Globe size={16} />} label="Integrations" value={integrations?.length || 0} />
        <KpiTile tone="success" icon={<DollarSign size={16} />} label="MRR" value={`$${tenant.mrr}`} />
      </div>

      <Tabs
        aria-label="Account detail sections"
        items={tabs}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      />

      {activeTab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard padding="md">
            <GlassCardTitle className="mb-4 text-sm">Activity (30 days)</GlassCardTitle>
            <ChartFrame height={220}>
              <BarChart data={activityByDay}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="date" tick={AXIS_TICK_SM} tickFormatter={(v) => v.slice(8)} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK_SM} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Bar {...NO_TWEEN} dataKey="jobs" fill={CHART_COLORS.brand} radius={[3, 3, 0, 0]} name="Jobs" />
                <Bar {...NO_TWEEN} dataKey="checks" fill={CHART_COLORS.emerald} radius={[3, 3, 0, 0]} name="Checks" />
              </BarChart>
            </ChartFrame>
          </GlassCard>

          <GlassCard padding="md">
            <GlassCardTitle className="mb-4 text-sm">Check Status Breakdown</GlassCardTitle>
            {statusPieData.length > 0 ? (
              <ChartFrame height={220}>
                <PieChart>
                  <Pie {...NO_TWEEN}
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="rgba(255,255,255,0.7)"
                labelLine={pieLabelLine}
                label={pieLabel}
                  >
                    {statusPieData.map((entry: any, i: number) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                  <Tooltip {...TOOLTIP_PROPS} />
                </PieChart>
              </ChartFrame>
            ) : (
              <ChartEmpty height={220}>No checks yet</ChartEmpty>
            )}
          </GlassCard>

          {integrations && integrations.length > 0 && (
            <GlassCard padding="md" className="lg:col-span-2">
              <GlassCardTitle className="mb-3 text-sm">Integrations</GlassCardTitle>
              <div className="space-y-2">
                {integrations.map((int: any) => (
                  <GlassPanel key={int.id} tone="plain" radius="input" padding="sm" className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-input bg-success-bg text-xs font-bold text-success-text">QB</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-ink-strong">{int.company_name || int.provider}</div>
                      <div className="text-xs text-ink-faint">Realm: {int.realm_id} &middot; Status: {int.status}</div>
                    </div>
                    <div className="text-xs text-ink-faint">{new Date(int.created_at).toLocaleDateString()}</div>
                  </GlassPanel>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="glass-divider">
            {profiles?.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-4 transition-colors duration-quick ease-settle hover:bg-brand/[0.045]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand-deep">
                  {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-strong">{u.full_name || 'No name'}</div>
                  <div className="flex items-center gap-1 text-xs text-ink-faint"><Mail size={10} /> {u.email}</div>
                </div>
                <Badge tone={u.role === 'admin' ? 'warning' : 'neutral'} size="sm" className="uppercase">{u.role}</Badge>
                <div className="flex items-center gap-1 text-xs text-ink-faint"><Clock size={10} /> {new Date(u.created_at).toLocaleDateString()}</div>
              </div>
            ))}
            {(!profiles || profiles.length === 0) && (<div className="py-8 text-center text-sm text-ink-faint">No users</div>)}
          </div>
        </GlassCard>
      )}

      {activeTab === 'jobs' && (
        <GlassCard padding="none" className="overflow-hidden">
          <Table>
            <Thead>
              <Tr>
                <Th className="w-10 px-2 text-center">#</Th>
                <Th>File</Th>
                <Th>Status</Th>
                <Th numeric>Checks</Th>
                <Th numeric>Created</Th>
              </Tr>
            </Thead>
            <Tbody>
              {jobs?.map((j: any, i: number) => (
                <Tr key={j.id} interactive>
                  <Td muted className="px-2 text-center font-mono text-xs">{i + 1}</Td>
                  <Td className="text-sm">{j.pdf_name}</Td>
                  <Td><Badge tone={jobTone(j.status)} size="sm" className="uppercase">{j.status}</Badge></Td>
                  <Td numeric>{j.total_checks || 0}</Td>
                  <Td numeric muted className="text-xs">{new Date(j.created_at).toLocaleString()}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {(!jobs || jobs.length === 0) && (<div className="py-8 text-center text-sm text-ink-faint">No jobs</div>)}
        </GlassCard>
      )}

      {activeTab === 'checks' && (
        <GlassCard padding="none" className="overflow-hidden">
          <Table>
            <Thead>
              <Tr>
                <Th className="w-10 px-2 text-center">#</Th>
                <Th>Check #</Th>
                <Th>Payee</Th>
                <Th numeric>Amount</Th>
                <Th numeric>Date</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {checks?.map((c: any, i: number) => (
                <Tr key={c.id} interactive>
                  <Td muted className="px-2 text-center font-mono text-xs">{i + 1}</Td>
                  <Td className="nums font-mono text-sm">{c.check_number || '—'}</Td>
                  <Td className="text-sm">{c.payee || '—'}</Td>
                  <Td numeric className="nums-money text-sm">{c.amount ? `$${Number(c.amount).toFixed(2)}` : '—'}</Td>
                  <Td numeric muted className="text-xs">{c.check_date || '—'}</Td>
                  <Td><Badge tone={checkTone(c.status)} size="sm" className="uppercase">{c.status?.replace(/_/g, ' ')}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {(!checks || checks.length === 0) && (<div className="py-8 text-center text-sm text-ink-faint">No checks</div>)}
        </GlassCard>
      )}

      {activeTab === 'qb' && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-glass-hairline px-5 py-3">
            <span className="text-eyebrow text-ink-faint">QuickBooks Synced Entries (Read-Only)</span>
            <span className="nums text-xs text-ink-faint">{qbEntries?.length || 0} entries</span>
          </div>
          <Table className={DENSE_LOG}>
            <Thead>
              <Tr>
                <Th className="w-10 px-2 text-center">#</Th>
                <Th>Check #</Th>
                <Th>Payee</Th>
                <Th numeric>Amount</Th>
                <Th numeric>Date</Th>
                <Th>Account</Th>
                <Th>Type</Th>
                <Th>Memo</Th>
              </Tr>
            </Thead>
            <Tbody>
              {qbEntries?.map((e: any, i: number) => (
                <Tr key={e.id} interactive>
                  <Td muted className="px-2 text-center font-mono text-xs">{i + 1}</Td>
                  <Td className="nums font-mono text-sm">{e.check_number || '—'}</Td>
                  <Td className="text-sm">{e.payee || '—'}</Td>
                  <Td numeric className="nums-money text-sm">{e.amount ? `$${Number(e.amount).toFixed(2)}` : '—'}</Td>
                  <Td numeric muted className="text-xs">{e.date || '—'}</Td>
                  <Td muted className="max-w-[120px] truncate text-sm">{e.account || '—'}</Td>
                  <Td><Badge tone="outline" size="sm" className="uppercase">{e.qb_source?.replace(/_/g, ' ')}</Badge></Td>
                  <Td muted className="max-w-[160px] truncate text-xs">{e.memo || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {(!qbEntries || qbEntries.length === 0) && (<div className="py-8 text-center text-sm text-ink-faint">No QuickBooks data synced for this account</div>)}
        </GlassCard>
      )}
    </div>
  );
}
