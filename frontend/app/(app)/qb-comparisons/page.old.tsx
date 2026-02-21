'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Download, Eye, EyeOff, ArrowUpDown, ArrowUp, ArrowDown,
  CheckCircle, AlertCircle, XCircle, RefreshCw, Settings, FileText, DollarSign,
  Calendar, Hash, Building, User, FileCheck, Loader2, X, ChevronDown, Upload
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
interface CheckExtraction {
  check_id: string;
  job_id: string;
  pdf_name: string;
  page: number;
  extraction?: {
    checkNumber?: string | { value: string };
    checkDate?: string | { value: string };
    amount?: string | { value: string };
    payee?: string | { value: string };
    bankName?: string | { value: string };
    memo?: string | { value: string };
  };
  image_file?: string;
}

interface QuickBooksEntry {
  id: string;
  checkNumber: string;
  date: string;
  amount: string;
  payee: string;
  account: string;
  memo: string;
  source: 'quickbooks';
}

interface ComparisonRow {
  id: string;
  checkNumber: string;
  date: string;
  amount: string;
  payee: string;
  bankAccount: string;
  memo: string;
  source: 'extraction' | 'quickbooks' | 'matched';
  matchStatus: 'matched' | 'missing-in-qb' | 'missing-in-extraction' | 'mismatch';
  extractionData?: CheckExtraction;
  qbData?: QuickBooksEntry;
  confidence?: number;
  discrepancies?: string[];
}

type SortField = 'checkNumber' | 'date' | 'amount' | 'payee' | 'matchStatus';
type SortDirection = 'asc' | 'desc';

// ── Helper Functions ───────────────────────────────────────
function extVal(ext: any, field: string): string {
  if (!ext) return '';
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.value || '';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  return '';
}

function parseAmount(amt: string): number {
  const cleaned = amt.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

function calculateMatchConfidence(ext: CheckExtraction, qb: QuickBooksEntry): number {
  let score = 0;
  const extraction = ext.extraction || {};
  
  // Check number match (40 points)
  if (extVal(extraction, 'checkNumber') === qb.checkNumber) score += 40;
  
  // Amount match (30 points)
  const extAmount = parseAmount(extVal(extraction, 'amount'));
  const qbAmount = parseAmount(qb.amount);
  if (Math.abs(extAmount - qbAmount) < 0.01) score += 30;
  
  // Payee match (20 points)
  const extPayee = normalizeString(extVal(extraction, 'payee'));
  const qbPayee = normalizeString(qb.payee);
  if (extPayee && qbPayee && extPayee.includes(qbPayee.substring(0, 5))) score += 20;
  
  // Date match (10 points)
  if (extVal(extraction, 'checkDate') === qb.date) score += 10;
  
  return score;
}

function intelligentMatch(extractions: CheckExtraction[], qbEntries: QuickBooksEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const matchedQbIds = new Set<string>();
  const matchedExtIds = new Set<string>();

  // First pass: exact check number matches
  extractions.forEach(ext => {
    const extCheckNum = extVal(ext.extraction, 'checkNumber');
    if (!extCheckNum) return;
    
    const qbMatch = qbEntries.find(qb => qb.checkNumber === extCheckNum && !matchedQbIds.has(qb.id));
    if (qbMatch) {
      const confidence = calculateMatchConfidence(ext, qbMatch);
      const discrepancies: string[] = [];
      
      // Check for discrepancies
      const extAmount = parseAmount(extVal(ext.extraction, 'amount'));
      const qbAmount = parseAmount(qbMatch.amount);
      if (Math.abs(extAmount - qbAmount) > 0.01) {
        discrepancies.push(`Amount mismatch: $${extAmount.toFixed(2)} vs $${qbAmount.toFixed(2)}`);
      }
      
      if (extVal(ext.extraction, 'checkDate') !== qbMatch.date) {
        discrepancies.push(`Date mismatch: ${extVal(ext.extraction, 'checkDate')} vs ${qbMatch.date}`);
      }
      
      const extPayee = normalizeString(extVal(ext.extraction, 'payee'));
      const qbPayee = normalizeString(qbMatch.payee);
      if (extPayee && qbPayee && !extPayee.includes(qbPayee.substring(0, 5)) && !qbPayee.includes(extPayee.substring(0, 5))) {
        discrepancies.push(`Payee mismatch: ${extVal(ext.extraction, 'payee')} vs ${qbMatch.payee}`);
      }
      
      rows.push({
        id: `matched-${ext.check_id}`,
        checkNumber: extCheckNum,
        date: extVal(ext.extraction, 'checkDate') || qbMatch.date,
        amount: extVal(ext.extraction, 'amount') || qbMatch.amount,
        payee: extVal(ext.extraction, 'payee') || qbMatch.payee,
        bankAccount: extVal(ext.extraction, 'bankName') || qbMatch.account,
        memo: extVal(ext.extraction, 'memo') || qbMatch.memo,
        source: 'matched',
        matchStatus: discrepancies.length > 0 ? 'mismatch' : 'matched',
        extractionData: ext,
        qbData: qbMatch,
        confidence,
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
      });
      
      matchedQbIds.add(qbMatch.id);
      matchedExtIds.add(ext.check_id);
    }
  });

  // Second pass: unmatched extractions
  extractions.forEach(ext => {
    if (matchedExtIds.has(ext.check_id)) return;
    
    rows.push({
      id: `ext-${ext.check_id}`,
      checkNumber: extVal(ext.extraction, 'checkNumber'),
      date: extVal(ext.extraction, 'checkDate'),
      amount: extVal(ext.extraction, 'amount'),
      payee: extVal(ext.extraction, 'payee'),
      bankAccount: extVal(ext.extraction, 'bankName'),
      memo: extVal(ext.extraction, 'memo'),
      source: 'extraction',
      matchStatus: 'missing-in-qb',
      extractionData: ext,
    });
  });

  // Third pass: unmatched QB entries
  qbEntries.forEach(qb => {
    if (matchedQbIds.has(qb.id)) return;
    
    rows.push({
      id: `qb-${qb.id}`,
      checkNumber: qb.checkNumber,
      date: qb.date,
      amount: qb.amount,
      payee: qb.payee,
      bankAccount: qb.account,
      memo: qb.memo,
      source: 'quickbooks',
      matchStatus: 'missing-in-extraction',
      qbData: qb,
    });
  });

  return rows;
}

// ── Component ──────────────────────────────────────────────
export default function QBComparisonsPage() {
  const [loading, setLoading] = useState(true);
  const [extractions, setExtractions] = useState<CheckExtraction[]>([]);
  const [qbEntries, setQbEntries] = useState<QuickBooksEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('checkNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [visibleColumns, setVisibleColumns] = useState({
    checkNumber: true,
    date: true,
    amount: true,
    payee: true,
    bankAccount: true,
    memo: true,
    source: true,
    matchStatus: true,
    actions: true,
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ComparisonRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch extractions from jobs
      const jobsRes = await fetch('/api/jobs');
      if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
      const jobsData = await jobsRes.json();
      
      const allExtractions: CheckExtraction[] = [];
      (jobsData.jobs || []).forEach((job: any) => {
        if (job.status === 'complete' && job.checks?.length > 0) {
          job.checks.forEach((check: any) => {
            if (check.extraction) {
              allExtractions.push({
                ...check,
                job_id: job.job_id,
                pdf_name: job.pdf_name,
              });
            }
          });
        }
      });
      
      setExtractions(allExtractions);
      
      // Fetch QuickBooks data from API
      try {
        const qbRes = await fetch('/api/quickbooks/entries');
        if (qbRes.ok) {
          const qbData = await qbRes.json();
          const qbEntries: QuickBooksEntry[] = (qbData.entries || []).map((entry: any, idx: number) => ({
            id: entry.id || `qb-${idx}`,
            checkNumber: entry.check_number || '',
            date: entry.date || '',
            amount: entry.amount || '',
            payee: entry.payee || '',
            account: entry.account || 'Checking',
            memo: entry.memo || '',
            source: 'quickbooks' as const,
          }));
          setQbEntries(qbEntries);
        }
      } catch (qbError) {
        console.error('Error fetching QuickBooks data:', qbError);
        setQbEntries([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);

  // Handle QuickBooks file upload
  const handleQBUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/quickbooks/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }
      
      const result = await res.json();
      alert(`Successfully uploaded ${result.entries_count} QuickBooks entries`);
      
      // Refresh data
      await fetchData();
      setShowUploadModal(false);
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Intelligent matching and filtering
  const comparisonData = useMemo(() => {
    let rows = intelligentMatch(extractions, qbEntries);
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter(row =>
        row.checkNumber.toLowerCase().includes(query) ||
        row.payee.toLowerCase().includes(query) ||
        row.amount.toLowerCase().includes(query) ||
        row.date.toLowerCase().includes(query) ||
        row.memo.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (filterStatus !== 'all') {
      rows = rows.filter(row => row.matchStatus === filterStatus);
    }
    
    // Apply sorting
    rows.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      
      if (sortField === 'amount') {
        aVal = parseAmount(aVal);
        bVal = parseAmount(bVal);
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return rows;
  }, [extractions, qbEntries, searchQuery, filterStatus, sortField, sortDirection]);

  // Statistics
  const stats = useMemo(() => {
    const matched = comparisonData.filter(r => r.matchStatus === 'matched').length;
    const mismatched = comparisonData.filter(r => r.matchStatus === 'mismatch').length;
    const missingInQB = comparisonData.filter(r => r.matchStatus === 'missing-in-qb').length;
    const missingInExt = comparisonData.filter(r => r.matchStatus === 'missing-in-extraction').length;
    
    return { matched, mismatched, missingInQB, missingInExt, total: comparisonData.length };
  }, [comparisonData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = (format: 'csv' | 'excel') => {
    const headers = Object.keys(visibleColumns)
      .filter(col => visibleColumns[col as keyof typeof visibleColumns] && col !== 'actions')
      .map(col => col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1'));
    
    const rows = comparisonData.map(row => {
      const rowData: any = {};
      if (visibleColumns.checkNumber) rowData['Check Number'] = row.checkNumber;
      if (visibleColumns.date) rowData['Date'] = row.date;
      if (visibleColumns.amount) rowData['Amount'] = row.amount;
      if (visibleColumns.payee) rowData['Payee'] = row.payee;
      if (visibleColumns.bankAccount) rowData['Bank Account'] = row.bankAccount;
      if (visibleColumns.memo) rowData['Memo'] = row.memo;
      if (visibleColumns.source) rowData['Source'] = row.source;
      if (visibleColumns.matchStatus) rowData['Match Status'] = row.matchStatus;
      return rowData;
    });
    
    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qb-comparison-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      matched: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
      mismatch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: AlertCircle },
      'missing-in-qb': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: FileCheck },
      'missing-in-extraction': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.matched;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.bg} ${config.text} ${config.border}`}>
        <Icon size={11} />
        {status.replace(/-/g, ' ')}
      </span>
    );
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-gray-400" />;
    return sortDirection === 'asc' ? <ArrowUp size={12} className="text-blue-600" /> : <ArrowDown size={12} className="text-blue-600" />;
  };

  return (
    <div className="max-w-[1600px] mx-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">QB Comparisons</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Intelligent matching between QuickBooks data and cheque extractions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-[13px] font-medium transition shadow-sm"
          >
            <Upload size={14} />
            Upload QB Data
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-[13px] font-medium transition shadow-sm"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Records', value: stats.total, icon: FileText, bg: 'bg-gray-50', color: 'text-gray-600' },
          { label: 'Matched', value: stats.matched, icon: CheckCircle, bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Mismatched', value: stats.mismatched, icon: AlertCircle, bg: 'bg-amber-50', color: 'text-amber-600' },
          { label: 'Missing in QB', value: stats.missingInQB, icon: FileCheck, bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: 'Missing in Extraction', value: stats.missingInExt, icon: XCircle, bg: 'bg-red-50', color: 'text-red-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stat.bg}`}>
              <stat.icon size={16} className={stat.color} />
            </div>
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{stat.label}</p>
              <p className="text-xl font-semibold text-gray-900 -mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by check number, payee, amount, date, or memo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-[13px] font-medium appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="matched">Matched</option>
              <option value="mismatch">Mismatched</option>
              <option value="missing-in-qb">Missing in QB</option>
              <option value="missing-in-extraction">Missing in Extraction</option>
            </select>
            <Filter size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Column Visibility */}
          <div className="relative">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition"
            >
              <Settings size={14} />
              Columns
              <ChevronDown size={12} />
            </button>
            
            {showColumnSettings && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border z-50 py-2">
                {Object.keys(visibleColumns).map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col as keyof typeof visibleColumns]}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[13px] text-gray-700 capitalize">
                      {col.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-100">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {visibleColumns.checkNumber && (
                    <th
                      onClick={() => handleSort('checkNumber')}
                      className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-1">
                        <Hash size={12} />
                        Check #
                        {getSortIcon('checkNumber')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.date && (
                    <th
                      onClick={() => handleSort('date')}
                      className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        Date
                        {getSortIcon('date')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.amount && (
                    <th
                      onClick={() => handleSort('amount')}
                      className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-1">
                        <DollarSign size={12} />
                        Amount
                        {getSortIcon('amount')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.payee && (
                    <th
                      onClick={() => handleSort('payee')}
                      className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        Payee
                        {getSortIcon('payee')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.bankAccount && (
                    <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Building size={12} />
                        Bank/Account
                      </div>
                    </th>
                  )}
                  {visibleColumns.memo && (
                    <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      Memo
                    </th>
                  )}
                  {visibleColumns.source && (
                    <th className="px-3 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      Source
                    </th>
                  )}
                  {visibleColumns.matchStatus && (
                    <th
                      onClick={() => handleSort('matchStatus')}
                      className="px-3 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="flex items-center justify-center gap-1">
                        Status
                        {getSortIcon('matchStatus')}
                      </div>
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th className="px-3 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comparisonData.length === 0 ? (
                  <tr>
                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-3 py-12 text-center text-gray-400">
                      No matching records found
                    </td>
                  </tr>
                ) : (
                  comparisonData.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/30 transition cursor-pointer"
                      onClick={() => setSelectedRow(row)}
                    >
                      {visibleColumns.checkNumber && (
                        <td className="px-3 py-3 font-medium text-gray-900">
                          {row.checkNumber || '—'}
                        </td>
                      )}
                      {visibleColumns.date && (
                        <td className="px-3 py-3 text-gray-600">
                          {row.date || '—'}
                        </td>
                      )}
                      {visibleColumns.amount && (
                        <td className="px-3 py-3 font-semibold text-emerald-700">
                          {row.amount ? `$${parseAmount(row.amount).toFixed(2)}` : '—'}
                        </td>
                      )}
                      {visibleColumns.payee && (
                        <td className="px-3 py-3 text-gray-900">
                          {row.payee || '—'}
                        </td>
                      )}
                      {visibleColumns.bankAccount && (
                        <td className="px-3 py-3 text-gray-600 text-[12px]">
                          {row.bankAccount || '—'}
                        </td>
                      )}
                      {visibleColumns.memo && (
                        <td className="px-3 py-3 text-gray-500 text-[12px] max-w-[200px] truncate">
                          {row.memo || '—'}
                        </td>
                      )}
                      {visibleColumns.source && (
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            row.source === 'matched' ? 'bg-purple-100 text-purple-700' :
                            row.source === 'extraction' ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {row.source}
                          </span>
                        </td>
                      )}
                      {visibleColumns.matchStatus && (
                        <td className="px-3 py-3 text-center">
                          {getStatusBadge(row.matchStatus)}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRow(row);
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination info */}
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[12px] text-gray-500">
            <span>Showing {comparisonData.length} records</span>
            <span>
              {stats.matched} matched · {stats.mismatched} mismatched · {stats.missingInQB} missing in QB · {stats.missingInExt} missing in extraction
            </span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Check #{selectedRow.checkNumber || 'N/A'}
                </h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Detailed comparison view</p>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div>
                <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Match Status</h4>
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedRow.matchStatus)}
                  {selectedRow.confidence !== undefined && (
                    <span className="text-[12px] text-gray-500">
                      Confidence: {selectedRow.confidence}%
                    </span>
                  )}
                </div>
              </div>

              {/* Discrepancies */}
              {selectedRow.discrepancies && selectedRow.discrepancies.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Discrepancies</h4>
                  <div className="space-y-1">
                    {selectedRow.discrepancies.map((disc, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[13px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        <span>{disc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-2 gap-6">
                {/* Extraction Data */}
                <div>
                  <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileCheck size={12} />
                    Extraction Data
                  </h4>
                  {selectedRow.extractionData ? (
                    <div className="space-y-2 bg-blue-50/30 rounded-lg p-4 border border-blue-100">
                      <div>
                        <span className="text-[11px] text-gray-500">Source:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.extractionData.pdf_name}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Page:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.extractionData.page}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Check Number:</span>
                        <p className="text-[13px] font-medium text-gray-900">
                          {extVal(selectedRow.extractionData.extraction, 'checkNumber') || '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Date:</span>
                        <p className="text-[13px] font-medium text-gray-900">
                          {extVal(selectedRow.extractionData.extraction, 'checkDate') || '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Amount:</span>
                        <p className="text-[13px] font-semibold text-emerald-700">
                          {extVal(selectedRow.extractionData.extraction, 'amount') || '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Payee:</span>
                        <p className="text-[13px] font-medium text-gray-900">
                          {extVal(selectedRow.extractionData.extraction, 'payee') || '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Bank:</span>
                        <p className="text-[13px] font-medium text-gray-900">
                          {extVal(selectedRow.extractionData.extraction, 'bankName') || '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Memo:</span>
                        <p className="text-[13px] font-medium text-gray-900">
                          {extVal(selectedRow.extractionData.extraction, 'memo') || '—'}
                        </p>
                      </div>
                      
                      {/* Check Image Preview */}
                      {selectedRow.extractionData.image_file && (
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <span className="text-[11px] text-gray-500 mb-2 block">Preview:</span>
                          <img
                            src={`/api/check-image/${selectedRow.extractionData.job_id}/${selectedRow.extractionData.check_id}`}
                            alt="Check preview"
                            className="w-full rounded border border-gray-200"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-[13px] text-gray-400">
                      No extraction data available
                    </div>
                  )}
                </div>

                {/* QuickBooks Data */}
                <div>
                  <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Building size={12} />
                    QuickBooks Data
                  </h4>
                  {selectedRow.qbData ? (
                    <div className="space-y-2 bg-green-50/30 rounded-lg p-4 border border-green-100">
                      <div>
                        <span className="text-[11px] text-gray-500">Source:</span>
                        <p className="text-[13px] font-medium text-gray-900">QuickBooks</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Check Number:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.qbData.checkNumber}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Date:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.qbData.date}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Amount:</span>
                        <p className="text-[13px] font-semibold text-emerald-700">${parseAmount(selectedRow.qbData.amount).toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Payee:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.qbData.payee}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Account:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.qbData.account}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500">Memo:</span>
                        <p className="text-[13px] font-medium text-gray-900">{selectedRow.qbData.memo}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-[13px] text-gray-400">
                      No QuickBooks data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !uploading && setShowUploadModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Upload QuickBooks Data</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Import CSV or IIF file from QuickBooks</p>
              </div>
              <button
                onClick={() => !uploading && setShowUploadModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                disabled={uploading}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".csv,.iif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleQBUpload(file);
                  }}
                  disabled={uploading}
                  className="hidden"
                  id="qb-file-upload"
                />
                <label
                  htmlFor="qb-file-upload"
                  className={`cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="animate-spin text-blue-600" size={40} />
                      <p className="text-[13px] text-gray-600">Uploading and processing...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <Upload size={32} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-gray-900">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-[12px] text-gray-500 mt-1">
                          CSV or IIF files from QuickBooks
                        </p>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                <h4 className="text-[12px] font-semibold text-blue-900">Supported Formats:</h4>
                <ul className="text-[12px] text-blue-700 space-y-1 ml-4 list-disc">
                  <li>QuickBooks Desktop IIF export</li>
                  <li>QuickBooks Online CSV export</li>
                  <li>Generic CSV with check data</li>
                </ul>
              </div>

              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-[12px] text-amber-800">
                  <strong>Note:</strong> Uploading new data will replace existing QuickBooks entries in the comparison.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                className="px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
