'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, CheckCircle, Loader2, BarChart3,
  TrendingUp, Layers, Zap, Clock,
} from 'lucide-react';

interface Job {
  job_id: string;
  pdf_name: string;
  status: string;
  total_pages: number;
  total_checks: number;
  checks?: any[];
  created_at: string;
  completed_at?: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/jobs`);
      const data = await res.json();
      setJobs((data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute stats
  const totalDocs = jobs.length;
  const completedDocs = jobs.filter(j => j.status === 'complete').length;
  const errorDocs = jobs.filter(j => j.status === 'error').length;
  const totalChecks = jobs.reduce((s, j) => s + (j.total_checks || 0), 0);
  const allChecks = jobs.flatMap(j => j.checks || []);
  const extractedChecks = allChecks.filter(c => c.extraction && Object.keys(c.extraction).length > 0);
  const extractionRate = totalChecks > 0 ? Math.round((extractedChecks.length / totalChecks) * 100) : 0;
  const totalPages = jobs.reduce((s, j) => s + (j.total_pages || 0), 0);

  // Method breakdown
  const methodCounts: Record<string, number> = {};
  extractedChecks.forEach(c => {
    (c.methods_used || []).forEach((m: string) => {
      methodCounts[m] = (methodCounts[m] || 0) + 1;
    });
  });
  const methodEntries = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);

  // Per-document stats for the table
  const docStats = jobs.filter(j => j.status === 'complete').map(j => {
    const checks = j.checks || [];
    const ext = checks.filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length;
    return { ...j, extracted: ext, rate: j.total_checks > 0 ? Math.round((ext / j.total_checks) * 100) : 0 };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Analytics</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Processing performance and extraction metrics</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Documents" value={totalDocs} icon={<FileText size={16} className="text-blue-500" />} sub={`${completedDocs} complete`} />
        <StatCard label="Total Cheques" value={totalChecks} icon={<Layers size={16} className="text-indigo-500" />} sub={`${totalPages} pages scanned`} />
        <StatCard label="Extracted" value={extractedChecks.length} icon={<CheckCircle size={16} className="text-emerald-500" />} sub={`${extractionRate}% success rate`} />
        <StatCard label="Methods Used" value={methodEntries.length} icon={<Zap size={16} className="text-amber-500" />} sub={methodEntries.map(([m]) => m).join(', ') || 'None'} />
      </div>

      {/* Extraction Method Breakdown */}
      {methodEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 p-5">
          <h2 className="text-[13px] font-medium text-gray-500 uppercase tracking-wider mb-4">Extraction Methods</h2>
          <div className="space-y-3">
            {methodEntries.map(([method, count]) => {
              const pct = Math.round((count / extractedChecks.length) * 100);
              const colors: Record<string, string> = {
                tesseract: 'bg-blue-500',
                numarkdown: 'bg-purple-500',
                gemini: 'bg-amber-500',
              };
              return (
                <div key={method}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-gray-900 capitalize">{method}</span>
                    <span className="text-[12px] text-gray-500">{count} cheques &middot; {pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colors[method] || 'bg-gray-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Extraction Rate by Document */}
      {docStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-gray-900">Per-Document Extraction</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {docStats.slice(0, 15).map(doc => (
              <div key={doc.job_id} className="px-5 py-3 flex items-center gap-3">
                <FileText size={14} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900 truncate">{doc.pdf_name}</div>
                  <div className="text-[11px] text-gray-500">{doc.extracted}/{doc.total_checks} cheques</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${doc.rate === 100 ? 'bg-emerald-500' : doc.rate > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
                      style={{ width: `${doc.rate}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-medium w-8 text-right ${doc.rate === 100 ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {doc.rate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Breakdown */}
      {totalDocs > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 p-5">
          <h2 className="text-[13px] font-medium text-gray-500 uppercase tracking-wider mb-4">Job Status</h2>
          <div className="flex gap-3">
            {[
              { label: 'Complete', count: completedDocs, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Processing', count: jobs.filter(j => ['extracting', 'ocr_running', 'detecting', 'analyzed'].includes(j.status)).length, color: 'bg-blue-100 text-blue-700' },
              { label: 'Error', count: errorDocs, color: 'bg-red-100 text-red-700' },
              { label: 'Pending', count: jobs.filter(j => j.status === 'pending').length, color: 'bg-gray-100 text-gray-600' },
            ].filter(s => s.count > 0).map(s => (
              <div key={s.label} className={`px-3 py-2 rounded-lg text-[12px] font-medium ${s.color}`}>
                {s.count} {s.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalDocs === 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 px-5 py-16 text-center">
          <BarChart3 className="mx-auto text-gray-300 mb-3" size={36} />
          <p className="text-[13px] font-medium text-gray-500">No data yet</p>
          <p className="text-[12px] text-gray-400 mt-1">Upload and process documents to see analytics</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: number | string; icon: React.ReactNode; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[24px] font-semibold text-gray-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</div>
    </div>
  );
}