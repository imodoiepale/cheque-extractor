'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw } from 'lucide-react';
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

/** Administrator is the only role that carries authority, so it is the only
 *  one that carries colour. Member and viewer read as plain counts. */
const roleTone = (role: string) =>
  role === 'admin' ? 'warning' : role === 'viewer' ? 'outline' : 'neutral';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q) ||
        u.tenant_name.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== 'all') {
      result = result.filter(u => u.role === roleFilter);
    }
    return result;
  }, [users, search, roleFilter]);

  const roleBreakdown = useMemo(() => {
    const b: Record<string, number> = {};
    users.forEach(u => { b[u.role] = (b[u.role] || 0) + 1; });
    return b;
  }, [users]);

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
        <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Users</h1>
        <p className="nums mt-1 text-sm text-ink-body">{users.length} users across all tenants</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile tone="brand" label="Total Users" value={users.length} />
        {Object.entries(roleBreakdown).map(([role, count]) => (
          <KpiTile key={role} label={`${role}s`} value={count} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" />
          <Input
            type="text"
            placeholder="Search by name, email, or tenant..."
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role" className="sm:w-44">
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </Select>
      </div>

      {/* Table. Shared Td recipe — py-3, the pre-redesign row height. */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="hidden md:block">
          <Table>
            <Thead>
              <Tr>
                <Th className="pl-5">User</Th>
                <Th>Tenant</Th>
                <Th>Role</Th>
                <Th>Plan</Th>
                <Th numeric>Jobs</Th>
                <Th numeric>Last Active</Th>
                <Th numeric className="pr-5">Joined</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((u) => (
                <Tr key={u.id} interactive>
                  <Td className="pl-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand-deep">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink-strong">{u.full_name || 'No name'}</div>
                        <div className="truncate text-xs text-ink-faint">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Link href={`/admin/tenants/${u.tenant_id}`} className="text-sm text-ink-body transition-colors hover:text-brand-deep">
                      {u.tenant_name}
                    </Link>
                  </Td>
                  <Td><Badge tone={roleTone(u.role)} size="sm" className="uppercase">{u.role}</Badge></Td>
                  <Td><Badge tone={planTone(u.tenant_plan)} size="sm" className="uppercase">{u.tenant_plan}</Badge></Td>
                  <Td numeric>{u.job_count}</Td>
                  <Td numeric muted className="text-xs">{new Date(u.last_activity).toLocaleDateString()}</Td>
                  <Td numeric muted className="pr-5 text-xs">{new Date(u.created_at).toLocaleDateString()}</Td>
                </Tr>
              ))}
              {filtered.length === 0 && (
                <TableEmpty colSpan={7} title="No users match your filters" description="Clear the search or widen the role filter." />
              )}
            </Tbody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="glass-divider md:hidden">
          {filtered.map((u) => (
            <div key={u.id} className="p-4">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand-deep">
                  {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-strong">{u.full_name || u.email}</div>
                  <div className="text-xs text-ink-faint">{u.tenant_name}</div>
                </div>
                <Badge tone={roleTone(u.role)} size="sm" className="uppercase">{u.role}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><div className="text-ink-faint">Plan</div><div className="font-semibold text-ink-strong">{u.tenant_plan}</div></div>
                <div><div className="text-ink-faint">Jobs</div><div className="nums font-semibold text-ink-strong">{u.job_count}</div></div>
                <div><div className="text-ink-faint">Joined</div><div className="nums font-semibold text-ink-strong">{new Date(u.created_at).toLocaleDateString()}</div></div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-ink-faint">No users match your filters</div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
