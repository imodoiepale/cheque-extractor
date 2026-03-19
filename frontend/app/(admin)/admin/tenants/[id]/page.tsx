'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Users, FileCheck, Briefcase, DollarSign,
  RefreshCw, Clock, Mail, Shield, ChevronRight, Globe
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const planColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-500',
  starter: 'bg-blue-50 text-blue-600',
  professional: 'bg-indigo-50 text-indigo-600',
  pro: 'bg-indigo-50 text-indigo-600',
  enterprise: 'bg-purple-50 text-purple-600',
};

const statusColors: Record<string, string> = {
  pending_review: '#f59e0b',
  approved: '#22c55e',
  exported: '#3b82f6',
  rejected: '#ef4444',
  duplicate: '#f97316',
  error: '#dc2626',
};

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!data?.tenant) return <div className="p-8 text-gray-400">Tenant not found</div>;

  const { tenant, profiles, jobs, checks, integrations, qbEntries, checkStatuses, activityByDay } = data;
  const TT = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, color: '#111' };
  const AX = { fill: '#9ca3af', fontSize: 10 };

  const statusPieData = Object.entries(checkStatuses || {}).map(([name, value]) => ({
    name: name.replace(/_/g, ' '), value, color: statusColors[name] || '#6b7280',
  }));

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: `Users (${profiles?.length || 0})` },
    { id: 'jobs', label: `Jobs (${jobs?.length || 0})` },
    { id: 'checks', label: `Checks (${checks?.length || 0})` },
    { id: 'qb', label: `QB Data (${qbEntries?.length || 0})` },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/admin/tenants')} className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} className="text-gray-400" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{tenant.name}</h1>
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${planColors[tenant.plan] || planColors.free}`}>{tenant.plan}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Globe size={11} /> {tenant.slug}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Joined {new Date(tenant.created_at).toLocaleDateString()}</span>
            <span className="flex items-center gap-1"><DollarSign size={11} /> ${tenant.mrr}/mo</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><Users size={14} className="text-blue-600" /><span className="text-[10px] text-gray-400 uppercase font-bold">Users</span></div>
          <div className="text-xl font-black text-gray-900">{profiles?.length || 0}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><Briefcase size={14} className="text-indigo-600" /><span className="text-[10px] text-gray-400 uppercase font-bold">Jobs</span></div>
          <div className="text-xl font-black text-gray-900">{jobs?.length || 0}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><FileCheck size={14} className="text-violet-600" /><span className="text-[10px] text-gray-400 uppercase font-bold">Checks</span></div>
          <div className="text-xl font-black text-gray-900">{checks?.length || 0}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><Globe size={14} className="text-sky-600" /><span className="text-[10px] text-gray-400 uppercase font-bold">Integrations</span></div>
          <div className="text-xl font-black text-gray-900">{integrations?.length || 0}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2"><DollarSign size={14} className="text-emerald-600" /><span className="text-[10px] text-gray-400 uppercase font-bold">MRR</span></div>
          <div className="text-xl font-black text-emerald-600">${tenant.mrr}</div>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-lg p-1 border border-gray-100 shadow-sm">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Activity (30 days)</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={AX} tickFormatter={(v) => v.slice(8)} axisLine={false} tickLine={false} />
                  <YAxis tick={AX} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} />
                  <Bar dataKey="jobs" fill="#6366f1" radius={[2, 2, 0, 0]} name="Jobs" />
                  <Bar dataKey="checks" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Checks" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Check Status Breakdown</h3>
            {statusPieData.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {statusPieData.map((entry: any, i: number) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={TT} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (<div className="h-[220px] flex items-center justify-center text-xs text-gray-300">No checks yet</div>)}
          </div>
          {integrations && integrations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Integrations</h3>
              <div className="space-y-2">
                {integrations.map((int: any) => (
                  <div key={int.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600 text-xs font-bold">QB</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{int.company_name || int.provider}</div>
                      <div className="text-[10px] text-gray-400">Realm: {int.realm_id} · Status: {int.status}</div>
                    </div>
                    <div className="text-[10px] text-gray-400">{new Date(int.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {profiles?.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-bold">
                  {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{u.full_name || 'No name'}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} /> {u.email}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>{u.role}</span>
                <div className="text-[10px] text-gray-400 flex items-center gap-1"><Clock size={10} /> {new Date(u.created_at).toLocaleDateString()}</div>
              </div>
            ))}
            {(!profiles || profiles.length === 0) && (<div className="py-8 text-center text-xs text-gray-300">No users</div>)}
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-center py-3 px-2 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">File</th>
                  <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Status</th>
                  <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Checks</th>
                  <th className="text-right py-3 px-5 text-[10px] font-bold text-gray-400 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs?.map((j: any, i: number) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="py-3 px-2 text-center text-[10px] text-gray-300 font-mono">{i + 1}</td>
                    <td className="py-3 px-4 text-xs text-gray-700">{j.pdf_name}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        j.status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                        j.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      }`}>{j.status}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500">{j.total_checks || 0}</td>
                    <td className="py-3 px-5 text-right text-[11px] text-gray-400">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!jobs || jobs.length === 0) && (<div className="py-8 text-center text-xs text-gray-300">No jobs</div>)}
        </div>
      )}

      {activeTab === 'checks' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-center py-3 px-2 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Check #</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Payee</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Amount</th>
                  <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Date</th>
                  <th className="text-center py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {checks?.map((c: any, i: number) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3 px-2 text-center text-[10px] text-gray-300 font-mono">{i + 1}</td>
                    <td className="py-3 px-4 text-xs text-gray-500 font-mono">{c.check_number || '—'}</td>
                    <td className="py-3 px-4 text-xs text-gray-700">{c.payee || '—'}</td>
                    <td className="py-3 px-4 text-right text-xs text-gray-700 font-mono">{c.amount ? `$${Number(c.amount).toFixed(2)}` : '—'}</td>
                    <td className="py-3 px-4 text-center text-[11px] text-gray-400">{c.check_date || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        c.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                        c.status === 'exported' ? 'bg-blue-50 text-blue-600' :
                        c.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      }`}>{c.status?.replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!checks || checks.length === 0) && (<div className="py-8 text-center text-xs text-gray-300">No checks</div>)}
        </div>
      )}

      {activeTab === 'qb' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase">QuickBooks Synced Entries (Read-Only)</span>
            <span className="text-[10px] text-gray-300">{qbEntries?.length || 0} entries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/30">
                  <th className="text-center py-3 px-2 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Check #</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Payee</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold text-gray-400 uppercase">Amount</th>
                  <th className="text-center py-3 px-3 text-[10px] font-bold text-gray-400 uppercase">Date</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-gray-400 uppercase">Account</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold text-gray-400 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-gray-400 uppercase">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {qbEntries?.map((e: any, i: number) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-2 text-center text-[10px] text-gray-300 font-mono">{i + 1}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-700 font-mono">{e.check_number || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-700">{e.payee || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-xs text-gray-700 font-mono">{e.amount ? `$${Number(e.amount).toFixed(2)}` : '—'}</td>
                    <td className="py-2.5 px-3 text-center text-[11px] text-gray-400">{e.date || '—'}</td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 truncate max-w-[120px]">{e.account || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-sky-50 text-sky-600">{e.qb_source?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-gray-400 truncate max-w-[160px]">{e.memo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!qbEntries || qbEntries.length === 0) && (<div className="py-8 text-center text-xs text-gray-300">No QuickBooks data synced for this account</div>)}
        </div>
      )}
    </div>
  );
}
