'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download, FileText, CheckCircle, FileSpreadsheet,
  ChevronDown, Loader2, AlertCircle, ArrowRight,
} from 'lucide-react';

interface Job {
  job_id: string;
  pdf_name: string;
  status: string;
  total_checks: number;
  checks?: any[];
  created_at: string;
  completed_at?: string;
}

interface ExportFormat {
  id: string;
  name: string;
  ext: string;
  description: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

export default function ExportPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<{ jobId: string; format: string; time: string; checks: number }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, fmtRes] = await Promise.all([
        fetch(`${BACKEND}/api/jobs`),
        fetch(`${BACKEND}/api/export-formats`),
      ]);
      const jobsData = await jobsRes.json();
      const fmtData = await fmtRes.json();

      const completed = (jobsData.jobs || [])
        .filter((j: Job) => j.status === 'complete' && (j.checks?.length || j.total_checks > 0))
        .sort((a: Job, b: Job) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setJobs(completed);
      setFormats(fmtData.formats || []);
    } catch (e) {
      console.error('Failed to fetch export data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleJob = (id: string) => {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.job_id)));
    }
  };

  const handleExport = async (jobId: string, format: string) => {
    setExporting(jobId);
    try {
      window.open(`${BACKEND}/api/jobs/${jobId}/export?format=${format}`, '_blank');
      const job = jobs.find(j => j.job_id === jobId);
      setExportHistory(prev => [{
        jobId,
        format,
        time: new Date().toISOString(),
        checks: job?.total_checks || 0,
      }, ...prev].slice(0, 20));
    } finally {
      setTimeout(() => setExporting(null), 1000);
    }
  };

  const handleBulkExport = () => {
    selectedJobs.forEach(id => handleExport(id, selectedFormat));
  };

  const extractedCount = (job: Job) => {
    return (job.checks || []).filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length;
  };

  const fmtDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const totalChecksSelected = jobs
    .filter(j => selectedJobs.has(j.job_id))
    .reduce((sum, j) => sum + extractedCount(j), 0);

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
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Export</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Download extracted cheque data in accounting formats</p>
      </div>

      {/* Format Selector */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-5">
        <h2 className="text-[13px] font-medium text-gray-500 uppercase tracking-wider mb-3">Export Format</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => setSelectedFormat(fmt.id)}
              className={`text-left px-3.5 py-2.5 rounded-lg border transition-all text-[13px] ${
                selectedFormat === fmt.id
                  ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/20'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="font-medium text-gray-900">{fmt.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{fmt.ext} &middot; {fmt.description.split('.')[0]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Documents Ready for Export */}
      <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedJobs.size === jobs.length && jobs.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
            />
            <h2 className="text-[13px] font-semibold text-gray-900">
              Documents ({jobs.length})
            </h2>
          </div>
          {selectedJobs.size > 0 && (
            <button
              onClick={handleBulkExport}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-white text-[12px] font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={13} />
              Export {selectedJobs.size} &middot; {totalChecksSelected} cheques
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileSpreadsheet className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-[13px] font-medium text-gray-500">No completed documents</p>
            <p className="text-[12px] text-gray-400 mt-1">Upload and extract cheques to export them</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {jobs.map(job => {
              const ext = extractedCount(job);
              const selected = selectedJobs.has(job.job_id);
              return (
                <div
                  key={job.job_id}
                  className={`px-5 py-3 flex items-center gap-3 transition-colors ${
                    selected ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleJob(job.job_id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
                  />
                  <FileText size={15} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 truncate">{job.pdf_name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {ext}/{job.total_checks} cheques extracted &middot; {fmtDate(job.completed_at || job.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleExport(job.job_id, selectedFormat)}
                    disabled={exporting === job.job_id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {exporting === job.job_id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {formats.find(f => f.id === selectedFormat)?.ext || '.csv'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export History (session-only) */}
      {exportHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-gray-900">Recent Exports</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {exportHistory.map((h, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] text-gray-700">
                    {jobs.find(j => j.job_id === h.jobId)?.pdf_name || h.jobId}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400">
                  {h.checks} cheques &middot; {h.format.toUpperCase()} &middot; {new Date(h.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}