'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt, FileText, Loader2, CreditCard, Download,
  Calendar, ChevronRight, Zap, TrendingUp, AlertCircle,
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
  total_api_cost_usd?: number;
  total_tokens?: number;
  api_usage_summary?: any;
}

interface ApiUsage {
  total_cost_usd: number;
  total_tokens: number;
  total_api_calls: number;
  usage_by_provider: {
    [key: string]: {
      calls: number;
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_cost_usd: number;
    };
  };
  jobs_with_usage: Job[];
}

interface Invoice {
  id: string;
  period: string;
  periodLabel: string;
  docs: number;
  pages: number;
  cheques: number;
  extracted: number;
  amount: number;
  status: 'paid' | 'current' | 'upcoming';
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

export default function BillingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fetch jobs
      const res = await fetch(`${BACKEND}/api/jobs`);
      const data = await res.json();
      setJobs((data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      
      // Fetch actual API usage from database
      const usageRes = await fetch(`${BACKEND}/api/billing/usage`);
      const usageData = await usageRes.json();
      setApiUsage(usageData);
    } catch (e) {
      console.error('Failed to fetch billing data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group jobs by month for invoices using actual API costs
  const invoices = useMemo(() => {
    const byMonth: Record<string, Job[]> = {};
    jobs.forEach(j => {
      const d = new Date(j.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(j);
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([period, monthJobs], idx): Invoice => {
        const docs = monthJobs.length;
        const pages = monthJobs.reduce((s, j) => s + (j.total_pages || 0), 0);
        const cheques = monthJobs.reduce((s, j) => s + (j.total_checks || 0), 0);
        const extracted = monthJobs.reduce((s, j) => {
          return s + (j.checks || []).filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length;
        }, 0);
        // Use actual API costs from database
        const amount = monthJobs.reduce((s, j) => s + (j.total_api_cost_usd || 0), 0);

        const [y, m] = period.split('-');
        const label = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const now = new Date();
        const isCurrentMonth = now.getFullYear() === parseInt(y) && (now.getMonth() + 1) === parseInt(m);

        return {
          id: period,
          period,
          periodLabel: label,
          docs,
          pages,
          cheques,
          extracted,
          amount,
          status: isCurrentMonth ? 'current' : idx === 0 ? 'current' : 'paid',
        };
      });
  }, [jobs]);

  // Current month stats using actual API usage
  const currentInvoice = invoices.find(i => i.status === 'current') || invoices[0];
  const totalSpent = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const totalExtracted = jobs.reduce((s, j) => {
    return s + (j.checks || []).filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length;
  }, 0);
  const totalPages = jobs.reduce((s, j) => s + (j.total_pages || 0), 0);
  const totalApiCost = apiUsage?.total_cost_usd || 0;
  const totalTokens = apiUsage?.total_tokens || 0;

  const fmtCurrency = (n: number) => `$${n.toFixed(2)}`;

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
        <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Billing & Usage</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Track processing usage and manage invoices</p>
      </div>

      {/* Usage Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-blue-500" />
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">This Month</span>
          </div>
          <div className="text-[24px] font-semibold text-gray-900 tracking-tight">
            {currentInvoice ? fmtCurrency(currentInvoice.amount) : '$0.00'}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {currentInvoice ? `${currentInvoice.extracted} extractions` : 'No usage'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-emerald-500" />
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">All Time</span>
          </div>
          <div className="text-[24px] font-semibold text-gray-900 tracking-tight">
            {fmtCurrency(totalSpent + (currentInvoice?.amount || 0))}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-indigo-500" />
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Pages</span>
          </div>
          <div className="text-[24px] font-semibold text-gray-900 tracking-tight">{totalPages}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">processed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={16} className="text-amber-500" />
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Extractions</span>
          </div>
          <div className="text-[24px] font-semibold text-gray-900 tracking-tight">{totalExtracted}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">completed</div>
        </div>
      </div>

      {/* Warning for Estimated Costs */}
      {apiUsage && (apiUsage as any).is_estimate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <h3 className="text-[13px] font-semibold text-amber-900 mb-1">Using Estimated Costs</h3>
              <p className="text-[12px] text-amber-800 mb-2">
                {(apiUsage as any).warning || 'Historical jobs extracted before billing tracking was enabled are showing estimated costs.'}
              </p>
              <p className="text-[11px] text-amber-700">
                <strong>To get accurate costs:</strong> Run database migration <code className="bg-amber-100 px-1 rounded">012_add_api_usage_tracking.sql</code> 
                {' '}or re-extract documents. See <code className="bg-amber-100 px-1 rounded">docs/BILLING_INTEGRATION.md</code> for details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* API Usage Breakdown */}
      {apiUsage && apiUsage.total_cost_usd > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 p-5">
          <h2 className="text-[13px] font-medium text-gray-500 uppercase tracking-wider mb-3">
            API Usage {(apiUsage as any).is_estimate ? '(Estimated)' : '(Actual GCC Costs)'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(apiUsage.usage_by_provider).map(([provider, usage]) => (
              <div key={provider} className="px-4 py-3 bg-blue-50/60 rounded-lg border border-blue-100">
                <div className="text-[13px] font-medium text-blue-900 capitalize">{provider}</div>
                <div className="text-[20px] font-semibold text-blue-900 mt-1">{fmtCurrency(usage.total_cost_usd)}</div>
                <div className="text-[11px] text-blue-600">{usage.calls} calls · {usage.total_tokens.toLocaleString()} tokens</div>
              </div>
            ))}
            <div className="px-4 py-3 bg-emerald-50/60 rounded-lg border border-emerald-100">
              <div className="text-[13px] font-medium text-emerald-900">Total API Cost</div>
              <div className="text-[20px] font-semibold text-emerald-900 mt-1">{fmtCurrency(totalApiCost)}</div>
              <div className="text-[11px] text-emerald-600">{totalTokens.toLocaleString()} total tokens</div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-[11px] text-blue-800">
              <strong>💡 Accurate Billing:</strong> Costs shown are actual usage from Google Cloud Console and OpenAI APIs, not estimates.
            </p>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-900">Invoices</h2>
        </div>

        {invoices.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Receipt className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-[13px] font-medium text-gray-500">No invoices yet</p>
            <p className="text-[12px] text-gray-400 mt-1">Usage will appear here after processing documents</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invoices.map(inv => (
              <div key={inv.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Calendar size={14} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900">{inv.periodLabel}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {inv.docs} doc{inv.docs !== 1 ? 's' : ''} &middot; {inv.pages} pages &middot; {inv.extracted} extractions
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[14px] font-semibold text-gray-900">{fmtCurrency(inv.amount)}</div>
                  <div className={`text-[10px] font-medium mt-0.5 ${
                    inv.status === 'current' ? 'text-blue-600' : inv.status === 'paid' ? 'text-emerald-600' : 'text-gray-400'
                  }`}>
                    {inv.status === 'current' ? 'Current' : inv.status === 'paid' ? 'Paid' : 'Upcoming'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
