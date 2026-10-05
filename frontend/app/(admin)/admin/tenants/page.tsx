'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, ChevronRight, Mail } from 'lucide-react';
import {
  Badge,
  GlassCard,
  Input,
  KpiTile,
  Select,
  Table,
  TableEmpty,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';

/** Plan is a tier, not a state. Free reads neutral, everything paid reads brand. */
const planTone = (plan: string): 'neutral' | 'brand' => (plan === 'free' ? 'neutral' : 'brand');

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div>
        <p className="text-eyebrow text-ink-faint">Super Admin</p>
        <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Accounts</h1>
        <p className="nums mt-1 text-sm text-ink-body">{tenants.length} accounts on the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" />
          <Input
            type="text"
            placeholder="Search accounts, emails..."
            aria-label="Search accounts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filter by plan" className="sm:w-44">
          {plans.map(p => (<option key={p} value={p}>{p === 'all' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}</option>))}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sort accounts" className="sm:w-44">
          <option value="created_at">Newest First</option>
          <option value="check_count">Most Checks</option>
          <option value="mrr">Highest MRR</option>
          <option value="user_count">Most Users</option>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Total" value={filtered.length} />
        <KpiTile label="Users" value={filtered.reduce((s, t) => s + t.user_count, 0)} />
        <KpiTile label="Checks" value={filtered.reduce((s, t) => s + t.check_count, 0).toLocaleString()} />
        <KpiTile tone="success" label="MRR" value={`$${filtered.reduce((s, t) => s + t.mrr, 0).toLocaleString()}`} />
      </div>

      {/* Table. Shared Td recipe — py-3, the pre-redesign row height. */}
      <GlassCard padding="none" className="overflow-hidden">
        <Table>
          <Thead>
            <Tr>
              <Th className="w-10 px-2 text-center">#</Th>
              <Th>Account / Email</Th>
              <Th>Plan</Th>
              <Th numeric>Jobs</Th>
              <Th numeric>Checks</Th>
              <Th numeric>MRR</Th>
              <Th numeric>Joined</Th>
              <Th className="w-8 px-2" />
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((t, idx) => (
              <Tr key={t.id} interactive className="group">
                <Td muted className="px-2 text-center font-mono text-xs">{idx + 1}</Td>
                <Td>
                  <Link href={`/admin/tenants/${t.id}`} className="block">
                    <div className="font-semibold text-ink-strong transition-colors group-hover:text-brand-deep">{t.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-faint">
                      <Mail size={9} />
                      {t.users?.length > 0 ? t.users.map((u: any) => u.email).join(', ') : t.slug}
                    </div>
                  </Link>
                </Td>
                <Td>
                  <Badge tone={planTone(t.plan)} size="sm" className="uppercase">{t.plan}</Badge>
                </Td>
                <Td numeric>{t.job_count}</Td>
                <Td numeric>{t.check_count}</Td>
                <Td numeric className="nums-money font-semibold text-success-text">${t.mrr}</Td>
                <Td numeric muted className="text-xs">{new Date(t.created_at).toLocaleDateString()}</Td>
                <Td className="px-2">
                  <Link href={`/admin/tenants/${t.id}`} aria-label={`Open ${t.name}`} className="inline-flex rounded-input p-1 text-ink-faint transition-colors hover:bg-brand/[0.08] hover:text-brand-deep">
                    <ChevronRight size={14} />
                  </Link>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <TableEmpty colSpan={8} title="No accounts match your filters" description="Clear the search or widen the plan filter." />
            )}
          </Tbody>
        </Table>
      </GlassCard>
    </div>
  );
}
