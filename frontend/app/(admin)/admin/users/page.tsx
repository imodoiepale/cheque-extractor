'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Users, Search, RefreshCw, Mail, Clock, Building2, Briefcase } from 'lucide-react';

const planColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500',
  starter: 'bg-blue-50 text-blue-600',
  professional: 'bg-indigo-50 text-indigo-600',
  pro: 'bg-indigo-50 text-indigo-600',
  enterprise: 'bg-purple-50 text-purple-600',
};

const roleColors: Record<string, string> = {
  admin: 'bg-amber-50 text-amber-600',
  member: 'bg-gray-100 text-gray-500',
  viewer: 'bg-sky-50 text-sky-600',
};

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Users</h1>
        <p className="text-sm text-gray-400 mt-1">{users.length} users across all tenants</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Total Users</div>
          <div className="text-xl font-black text-gray-900">{users.length}</div>
        </div>
        {Object.entries(roleBreakdown).map(([role, count]) => (
          <div key={role} className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{role}s</div>
            <div className="text-xl font-black text-gray-900">{count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or tenant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">User</th>
                <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tenant</th>
                <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Role</th>
                <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jobs</th>
                <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Active</th>
                <th className="text-right py-3 px-5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-[10px] font-bold shrink-0">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{u.full_name || 'No name'}</div>
                        <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/admin/tenants/${u.tenant_id}`} className="text-xs text-gray-500 hover:text-blue-600 transition-colors">
                      {u.tenant_name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${roleColors[u.role] || roleColors.member}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${planColors[u.tenant_plan] || planColors.free}`}>
                      {u.tenant_plan}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500">{u.job_count}</td>
                  <td className="py-3 px-4 text-right text-[11px] text-gray-400">{new Date(u.last_activity).toLocaleDateString()}</td>
                  <td className="py-3 px-5 text-right text-[11px] text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-gray-50">
          {filtered.map((u) => (
            <div key={u.id} className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-[10px] font-bold shrink-0">
                  {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{u.full_name || u.email}</div>
                  <div className="text-[10px] text-gray-400">{u.tenant_name}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${roleColors[u.role] || roleColors.member}`}>{u.role}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div><div className="text-gray-400">Plan</div><div className="text-gray-900 font-bold">{u.tenant_plan}</div></div>
                <div><div className="text-gray-400">Jobs</div><div className="text-gray-900 font-bold">{u.job_count}</div></div>
                <div><div className="text-gray-400">Joined</div><div className="text-gray-900 font-bold">{new Date(u.created_at).toLocaleDateString()}</div></div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No users match your filters</div>
        )}
      </div>
    </div>
  );
}
