'use client';

import { Fragment, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Building2, DollarSign, FileCheck, BarChart3,
  ArrowLeft, Crown, RefreshCw, ChevronDown, ChevronUp,
  Clock, Briefcase
} from 'lucide-react';
import {
  Badge,
  Button,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  KpiTile,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';

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

/** Plan is a tier, not a state. Free reads neutral, everything paid reads brand. */
const planTone = (plan: string): 'neutral' | 'brand' => (plan === 'free' ? 'neutral' : 'brand');

const planLabels: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_PRICING: Record<string, number> = {
  free: 0, starter: 49, professional: 129, pro: 129, enterprise: 299,
};

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin text-brand" />
          <p className="text-sm text-ink-body">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <GlassCard padding="lg" className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-bg">
            <Crown size={24} className="text-error-text" />
          </div>
          <GlassCardTitle className="mb-2">Access Denied</GlassCardTitle>
          <p className="mb-4 text-sm text-ink-body">{error}</p>
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (!data) return null;

  const { summary, tenants } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Crown size={18} className="text-warning" />
            <p className="text-eyebrow text-ink-faint">Super Admin</p>
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Platform Overview</h1>
          <p className="mt-1 text-sm text-ink-body">All tenants, users and revenue</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchData}
          disabled={refreshing}
          icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      {/* Revenue & stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          label="Total Tenants"
          value={summary.totalTenants}
          caption={`${summary.recentSignups} in last 30d`}
        />
        <KpiTile tone="brand" icon={<Users size={18} />} label="Total Users" value={summary.totalUsers} />
        <KpiTile
          tone="brand"
          icon={<FileCheck size={18} />}
          label="Total Checks Processed"
          value={summary.totalChecks.toLocaleString()}
          caption={`${summary.totalJobs} jobs`}
        />
      </div>

      {/* Plan breakdown */}
      <GlassCard padding="md" className="mb-8">
        <GlassCardTitle className="mb-4 flex items-center gap-2 text-sm">
          <BarChart3 size={16} className="text-ink-faint" /> Plan Breakdown
        </GlassCardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(summary.planBreakdown).map(([plan, count]) => {
            const revenue = count * (PLAN_PRICING[plan] || 0);
            return (
              <GlassPanel key={plan} tone="sunken" radius="tile" padding="md">
                <div className="mb-2">
                  <Badge tone={planTone(plan)} size="sm" className="uppercase">
                    {planLabels[plan] || plan}
                  </Badge>
                </div>
                <div className="nums font-heading text-2xl font-semibold text-ink-strong">{count}</div>
                <div className="nums text-xs text-ink-faint">
                  {revenue > 0 ? `$${revenue}/mo revenue` : 'No revenue'}
                </div>
              </GlassPanel>
            );
          })}
        </div>
      </GlassCard>

      {/* Tenants. Shared Td recipe — py-3, the pre-redesign row height. */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-glass-hairline px-5 py-4">
          <GlassCardTitle className="flex items-center gap-2 text-sm">
            <Briefcase size={16} className="text-ink-faint" /> All Tenants ({tenants.length})
          </GlassCardTitle>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <Thead>
              <Tr>
                <Th className="pl-5">Tenant</Th>
                <Th>Plan</Th>
                <Th numeric>Users</Th>
                <Th numeric>Jobs</Th>
                <Th numeric>Checks</Th>
                <Th numeric>MRR</Th>
                <Th numeric>Created</Th>
                <Th className="w-10 px-2" />
              </Tr>
            </Thead>
            <Tbody>
              {tenants.map((t) => (
                <Fragment key={t.id}>
                  <Tr interactive>
                    <Td className="pl-5">
                      <div className="font-semibold text-ink-strong">{t.name}</div>
                      <div className="text-xs text-ink-faint">{t.slug}</div>
                    </Td>
                    <Td>
                      <Badge tone={planTone(t.plan)} size="sm" className="uppercase">
                        {planLabels[t.plan] || t.plan}
                      </Badge>
                    </Td>
                    <Td numeric>{t.user_count}</Td>
                    <Td numeric>{t.job_count}</Td>
                    <Td numeric>{t.check_count}</Td>
                    <Td numeric className="nums-money font-semibold text-success-text">${t.mrr}</Td>
                    <Td numeric muted className="text-xs">{new Date(t.created_at).toLocaleDateString()}</Td>
                    <Td className="px-2">
                      <button
                        onClick={() => setExpandedTenant(expandedTenant === t.id ? null : t.id)}
                        aria-expanded={expandedTenant === t.id}
                        aria-label={`${expandedTenant === t.id ? 'Hide' : 'Show'} users in ${t.name}`}
                        className="rounded-input p-1 text-ink-faint transition-colors hover:bg-brand/[0.08] hover:text-brand-deep"
                      >
                        {expandedTenant === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </Td>
                  </Tr>
                  {expandedTenant === t.id && (
                    <Tr>
                      {/* An inset group, not a second blurred surface. */}
                      <Td colSpan={8} className="bg-surface-sunken/70 px-5 py-4">
                        <p className="text-eyebrow mb-2 text-ink-faint">Users in {t.name}</p>
                        <div className="space-y-2">
                          {t.users.map((u) => (
                            <GlassPanel key={u.id} tone="plain" radius="input" padding="sm" className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-xs font-bold text-white">
                                {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-ink-strong">{u.full_name || 'No name'}</div>
                                <div className="truncate text-xs text-ink-faint">{u.email}</div>
                              </div>
                              <Badge tone={u.role === 'admin' ? 'warning' : 'neutral'} size="sm" className="uppercase">
                                {u.role}
                              </Badge>
                              <span className="flex items-center gap-1 text-xs text-ink-faint">
                                <Clock size={10} /> {new Date(u.created_at).toLocaleDateString()}
                              </span>
                            </GlassPanel>
                          ))}
                          {t.users.length === 0 && (
                            <div className="text-xs italic text-ink-faint">No users found</div>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
            </Tbody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="glass-divider md:hidden">
          {tenants.map((t) => (
            <div key={t.id} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-strong">{t.name}</div>
                  <div className="text-xs text-ink-faint">{t.slug}</div>
                </div>
                <Badge tone={planTone(t.plan)} size="sm" className="uppercase">
                  {planLabels[t.plan] || t.plan}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-xs text-ink-faint">Users</div>
                  <div className="nums text-sm font-semibold text-ink-strong">{t.user_count}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-faint">Jobs</div>
                  <div className="nums text-sm font-semibold text-ink-strong">{t.job_count}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-faint">Checks</div>
                  <div className="nums text-sm font-semibold text-ink-strong">{t.check_count}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-faint">MRR</div>
                  <div className="nums text-sm font-semibold text-success-text">${t.mrr}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                block
                className="mt-3"
                onClick={() => setExpandedTenant(expandedTenant === t.id ? null : t.id)}
              >
                {expandedTenant === t.id ? 'Hide' : 'Show'} Users
                {expandedTenant === t.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </Button>
              {expandedTenant === t.id && (
                <div className="mt-3 space-y-2">
                  {t.users.map((u) => (
                    <GlassPanel key={u.id} tone="sunken" radius="input" padding="sm" className="flex items-center gap-2 text-xs">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-[8px] font-bold text-white">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink-strong">{u.email}</div>
                      </div>
                      <Badge tone={u.role === 'admin' ? 'warning' : 'neutral'} size="sm" className="uppercase">{u.role}</Badge>
                    </GlassPanel>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {tenants.length === 0 && (
          <div className="py-12 text-center text-sm text-ink-faint">No tenants found</div>
        )}
      </GlassCard>
    </div>
  );
}
