'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Settings, Loader2, AlertCircle, RefreshCw, Upload, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { QBCompanySwitcher } from '@/components/QBCompanySwitcher';
import Link from 'next/link';
import { useComparisonData } from './hooks/useComparisonData';
import { useComparisonState } from './hooks/useComparisonState';
import { useBackgroundExtraction } from './hooks/useBackgroundExtraction';
import { ComparisonControlsBar } from './components/ComparisonControlsBar';
import { StatisticsPanel } from './components/StatisticsPanel';
import { ComparisonTable } from './components/ComparisonTable';
import { DetailModal } from './components/DetailModal';
import { ColumnSettings } from './components/ColumnSettings';
import { Pagination } from './components/Pagination';
import { QBConnectionModal } from './components/QBConnectionModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { 
  intelligentMatch, 
  filterByDateRange, 
  filterByQBSource, 
  sortRows,
  ComparisonRow 
} from './utils/comparisonUtils';
import { exportToCSV, exportToExcel } from './utils/exportUtils';
import { createClient } from '@/lib/supabase/client';

export default function QBComparisonsPage() {
  const { loading, extractions, qbEntries, qbSources, error, refreshData } = useComparisonData();
  
  // Silently extract incomplete jobs in the background
  useBackgroundExtraction();
  const [qbConfigured, setQbConfigured] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(true);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Auto-open QB Reconcile tab once per session after the first successful
  // queued_for_reconcile approval. Users still get a toast CTA after that.
  const reconcileTabOpenedRef = useRef(false);
  const {
    searchQuery,
    setSearchQuery,
    sortField,
    sortDirection,
    filterStatus,
    setFilterStatus,
    selectedQBSource,
    setSelectedQBSource,
    qbDataSource,
    setQbDataSource,
    selectedPdfName,
    setSelectedPdfName,
    selectedAccount,
    setSelectedAccount,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    visibleColumns,
    setVisibleColumns,
    dateFormat,
    setDateFormat,
    showColumnSettings,
    setShowColumnSettings,
    selectedRow,
    setSelectedRow,
    showUploadModal,
    setShowUploadModal,
    handleSort,
    resetFilters,
  } = useComparisonState();

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [vouchedMap, setVouchedMap] = useState<Record<string, any>>({});
  const [vouchingId, setVouchingId] = useState<string | null>(null);
  const [deletingQBEntry, setDeletingQBEntry] = useState<string | null>(null);
  const [deletingAllQB, setDeletingAllQB] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [vouchDialog, setVouchDialog] = useState<{ row: ComparisonRow } | null>(null);
  const [vouchingToQB, setVouchingToQB] = useState(false);

  const showToast = useCallback((type: 'success' | 'warning' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Check if QuickBooks is configured and connected
  useEffect(() => {
    const checkQBConfig = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        const response = await fetch('/api/settings/integrations', { headers });
        if (response.ok) {
          const data = await response.json();
          const configured = !!(data.qbClientId || data.qboConnected);
          const connected = !!data.qboConnected;
          setQbConfigured(configured);
          setQbConnected(connected);
          
          console.log('🔐 QB Status:', { configured, connected });
          
          // Auto-refresh from database if connected but no local QB entries
          if (connected && qbEntries.length === 0 && !autoSyncAttempted) {
            console.log('🔄 Refreshing QB data from database...');
            setAutoSyncAttempted(true);
            refreshData();
          }
        }
      } catch (error) {
        console.error('Failed to check QB config:', error);
      } finally {
        setCheckingConfig(false);
      }
    };
    checkQBConfig();
  }, [qbEntries.length, autoSyncAttempted]);

  const handleSaveCheck = async (checkId: string, updates: any, jobId?: string) => {
    try {
      console.log('💾 Saving check edits:', checkId, updates);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      // Use the jobs-based fields route (avoids UUID mismatch on checks.id)
      const url = jobId
        ? `/api/jobs/${jobId}/checks/${checkId}/fields`
        : `/api/checks/${checkId}/update`;

      const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(updates) });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save check');
      }

      const data = await res.json();
      console.log('✅ Check saved successfully:', data);
      await refreshData();
      return data;
    } catch (error: any) {
      console.error('❌ Failed to save check:', error);
      throw error;
    }
  };

  const handleApproveCheck = async (checkId: string, jobId?: string, qbEntryId?: string, extractionData?: any) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    if (!jobId) {
      throw new Error('Job ID is required to approve a check. Please reload and try again.');
    }

    // Normalise OCR extraction fields to pass to the status route for QB PrivateNote enrichment
    const ext = extractionData?.extraction || {};
    const val = (f: any) => (typeof f === 'object' && f !== null ? f.value : f) || null;
    const checkData = {
      check_number:   val(ext.checkNumber),
      check_date:     val(ext.checkDate),
      amount:         val(ext.amount),
      payee:          val(ext.payee),
      bank_name:      val(ext.bankName),
      memo:           val(ext.memo),
      account_number: val(ext.accountNumber),
      routing_number: val(ext.routingNumber),
    };

    const res = await fetch(`/api/jobs/${jobId}/checks/${checkId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'approved', qbEntryId: qbEntryId || null, checkData }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Approve failed (${res.status})`);
    }

    const data = await res.json();
    console.log('✅ Check approved:', checkId, data);

    const qbSync = data.qbSync as { status: string; message?: string; readOnlyClearedStatus?: string | null } | undefined;
    const RECONCILE_URL = 'https://app.qbo.intuit.com/app/reconcile';
    switch (qbSync?.status) {
      case 'already_cleared':
        showToast('success', 'Approved — QuickBooks already has this transaction cleared ✓');
        break;
      case 'queued_for_reconcile':
        showToast(
          'success',
          'Approved — open QB Reconcile and click "Auto-Clear Kyriq Approved" (Chrome extension) to tick the C.'
        );
        // Auto-open Reconcile once per session on first queued approve.
        if (!reconcileTabOpenedRef.current && typeof window !== 'undefined') {
          reconcileTabOpenedRef.current = true;
          window.open(RECONCILE_URL, '_blank', 'noopener');
        }
        break;
      case 'manual_required':
        showToast(
          'warning',
          qbSync.message || 'Approved — Bill Payment must be ticked Cleared manually on QB Reconcile.'
        );
        break;
      case 'inactive_entity':
        showToast('warning', 'Approved in Kyriq ✓ — QB not stamped: a linked vendor or account is inactive in QuickBooks. Reactivate it and re-approve.');
        break;
      case 'failed':
        showToast('warning', `Approved in Kyriq ⚠ QB stamp failed: ${qbSync.message || 'unknown error'}`);
        break;
      case 'skipped':
      default:
        showToast('success', 'Check approved ✓');
    }

    await refreshData();
  };

  const handleRejectCheck = async (checkId: string, jobId?: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    if (!jobId) {
      throw new Error('Job ID is required to reject a check. Please reload and try again.');
    }

    const res = await fetch(`/api/jobs/${jobId}/checks/${checkId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'rejected' }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Reject failed (${res.status})`);
    }

    console.log('✅ Check rejected:', checkId);
    await refreshData();
  };

  const handleAutoSync = async () => {
    setSyncing(true);
    try {
      console.log('📡 Calling QB pull-checks API...');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('❌ No session for QB sync');
        return;
      }
      const res = await fetch('/api/qbo/pull-checks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ store: true }),
      });
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        throw new Error(res.status === 504 || rawText.startsWith('An error')
          ? 'Request timed out — try adding a date range filter to reduce data volume.'
          : `Server error (${res.status}): ${rawText.substring(0, 120)}`);
      }
      console.log('✅ QB Sync result:', data);
      if (res.ok) {
        await refreshData();
        const count = data.count ?? data.total ?? data.entries?.length ?? 0;
        const partialErrors: string[] = data.partialErrors || data.errors || [];
        if (count === 0) {
          showToast('warning', `Sync complete — 0 QB transactions found. Check your QB connection or date range.`);
        } else if (partialErrors.length > 0) {
          showToast('warning', `Synced ${count} QB transactions ⚠ (${partialErrors.length} partial error${partialErrors.length > 1 ? 's' : ''}: ${partialErrors[0].slice(0, 60)})`);
        } else {
          showToast('success', `Synced ${count} QB transactions ✓`);
        }
      } else {
        showToast('error', data.error || `Sync failed (${res.status})`);
      }
    } catch (err: any) {
      console.error('❌ Auto-sync failed:', err);
      showToast('error', err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportDropdown) {
        const target = event.target as Element;
        if (!target.closest('.export-dropdown')) {
          setShowExportDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportDropdown]);

  // Extract unique PDF names from extractions
  const pdfNames = useMemo(() => {
    const names = new Set<string>();
    extractions.forEach(ext => {
      if (ext.pdf_name) {
        names.add(ext.pdf_name);
      }
    });
    return Array.from(names).sort();
  }, [extractions]);

  // Extract unique account names from QB entries
  const accountNames = useMemo(() => {
    const accounts = new Set<string>();
    qbEntries.forEach(entry => {
      if (entry.account) {
        accounts.add(entry.account);
      }
    });
    return Array.from(accounts).sort();
  }, [qbEntries]);

  // Load vouched status on mount
  useEffect(() => {
    const loadVouchedStatus = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch('/api/checks/vouched', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (response.ok) {
          const { vouched } = await response.json();
          setVouchedMap(vouched || {});
        }
      } catch (err) {
        console.error('Failed to load vouched status:', err);
      }
    };
    loadVouchedStatus();
  }, []);

  // Step 1: Run matching ONLY when raw data changes (not on every filter change)
  const matchedRows = useMemo(() => {
    const rows = intelligentMatch(extractions, qbEntries);
    // Apply vouched status to rows
    rows.forEach(row => {
      const vouchedData = vouchedMap[row.id];
      if (vouchedData) {
        row.vouched = true;
        row.vouchedBy = vouchedData.vouchedBy;
        row.vouchedAt = vouchedData.vouchedAt;
      }
    });
    return rows;
  }, [extractions, qbEntries, vouchedMap]);

  // Step 2: Apply filters separately (cheap operation)
  const comparisonData = useMemo(() => {
    let rows = [...matchedRows];

    // Filter by QB data source (online/uploaded/both)
    if (qbDataSource !== 'both') {
      rows = rows.filter(row => {
        if (!row.qbData) return true;
        const isOnline = row.qbData.qbSource !== 'qbo_file_upload';
        const isUploaded = row.qbData.qbSource === 'qbo_file_upload';
        if (qbDataSource === 'online') return isOnline || row.source === 'extraction';
        if (qbDataSource === 'uploaded') return isUploaded || row.source === 'extraction';
        return true;
      });
    }

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

    if (filterStatus !== 'all') {
      rows = rows.filter(row => row.matchStatus === filterStatus);
    }

    // Filter by PDF name — show ALL checks from the selected document
    if (selectedPdfName !== 'all') {
      rows = rows.filter(row => {
        // Keep rows that have extractionData from this PDF
        if (row.extractionData?.pdf_name === selectedPdfName) return true;
        // Also keep QB-only rows that matched with a check from this PDF
        // (matched rows will have extractionData.pdf_name set)
        return false;
      });
    }

    // Filter by QB Account
    if (selectedAccount !== 'all') {
      rows = rows.filter(row => {
        // If row has QB data, check if account matches
        if (row.qbData?.account) {
          return row.qbData.account === selectedAccount;
        }
        // Also check bankAccount field (set from qbData.account in matched rows)
        if (row.bankAccount && row.source === 'matched') {
          return row.bankAccount === selectedAccount;
        }
        // Keep extraction-only rows visible (they have no QB account info)
        if (row.source === 'extraction') return true;
        // Hide QB-only rows that don't match
        return false;
      });
    }

    // "Show Issues Only" toggle: only keep rows with issues that are NOT vouched
    if (showIssuesOnly) {
      rows = rows.filter(row => row.hasIssue && !row.vouched);
    }

    rows = filterByDateRange(rows, startDate, endDate);
    rows = filterByQBSource(rows, selectedQBSource);
    rows = sortRows(rows, sortField, sortDirection);

    // Sort: issues first, then matched, then rest
    rows.sort((a, b) => {
      // If showIssuesOnly is off, still put issues/mismatches near top
      const aIssue = a.hasIssue ? 1 : 0;
      const bIssue = b.hasIssue ? 1 : 0;
      if (aIssue !== bIssue) return bIssue - aIssue; // issues first
      const aMatched = a.matchStatus === 'matched' || a.matchStatus === 'mismatch';
      const bMatched = b.matchStatus === 'matched' || b.matchStatus === 'mismatch';
      if (aMatched && !bMatched) return -1;
      if (!aMatched && bMatched) return 1;
      return 0;
    });

    return rows;
  }, [matchedRows, searchQuery, filterStatus, selectedPdfName, selectedAccount, startDate, endDate, selectedQBSource, qbDataSource, sortField, sortDirection, showIssuesOnly]);

  const statistics = useMemo(() => {
    const matched = comparisonData.filter(r => r.matchStatus === 'matched').length;
    const mismatched = comparisonData.filter(r => r.matchStatus === 'mismatch').length;
    const missingInQB = comparisonData.filter(r => r.matchStatus === 'missing-in-qb').length;
    const missingInExt = comparisonData.filter(r => r.matchStatus === 'missing-in-extraction').length;

    return {
      total: comparisonData.length,
      matched,
      mismatched,
      missingInQB,
      missingInExtraction: missingInExt,
    };
  }, [comparisonData]);

  const totalPages = Math.ceil(comparisonData.length / itemsPerPage);

  const hasActiveFilters = searchQuery !== '' || filterStatus !== 'all' || selectedQBSource !== 'all' || selectedPdfName !== 'all' || selectedAccount !== 'all' || startDate !== '' || endDate !== '' || showIssuesOnly;

  // Count issues for the toggle badge
  const issueCount = useMemo(() => {
    return matchedRows.filter(r => r.hasIssue).length;
  }, [matchedRows]);

  const handleExportCSV = () => {
    exportToCSV(comparisonData, visibleColumns);
    setShowExportDropdown(false);
  };

  const handleExportExcel = () => {
    exportToExcel(comparisonData, visibleColumns);
    setShowExportDropdown(false);
  };

  const doVouchLocal = async (row: ComparisonRow) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const response = await fetch('/api/checks/vouch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ checkIdentifier: row.id, checkNumber: row.checkNumber }),
    });
    if (response.ok) {
      setVouchedMap(prev => ({
        ...prev,
        [row.id]: { vouchedBy: session.user.id, vouchedAt: new Date().toISOString() },
      }));
    }
  };

  const handleVouch = async (row: ComparisonRow) => {
    // Missing-in-QB rows: show dialog to optionally create in QB first
    if (row.matchStatus === 'missing-in-qb') {
      setVouchDialog({ row });
      return;
    }
    setVouchingId(row.id);
    try {
      await doVouchLocal(row);
    } catch (err) {
      console.error('Failed to vouch check:', err);
    } finally {
      setVouchingId(null);
    }
  };

  const handleVouchConfirm = async (txnType: 'Deposit' | 'Purchase' | 'local') => {
    if (!vouchDialog) return;
    const row = vouchDialog.row;
    setVouchDialog(null);
    setVouchingId(row.id);
    setVouchingToQB(txnType !== 'local');
    try {
      if (txnType !== 'local') {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        const res = await fetch('/api/qbo/create-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            txnType,
            checkNumber: row.checkNumber,
            amount: row.amount,
            date: row.date,
            payee: row.payee,
            memo: row.memo,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `QB create failed (${res.status})`);
        showToast('success', `Created ${txnType} #${row.checkNumber} in QuickBooks ✓`);
        await refreshData();
      }
      await doVouchLocal(row);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create in QB');
    } finally {
      setVouchingId(null);
      setVouchingToQB(false);
    }
  };

  const handleUnvouch = async (row: ComparisonRow) => {
    setVouchingId(row.id);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/checks/vouch', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          checkIdentifier: row.id,
        }),
      });

      if (response.ok) {
        // Remove from local vouched map
        setVouchedMap(prev => {
          const newMap = { ...prev };
          delete newMap[row.id];
          return newMap;
        });
      }
    } catch (err) {
      console.error('Failed to unvouch check:', err);
    } finally {
      setVouchingId(null);
    }
  };

  const handleDeleteQBEntry = async (entryId: string) => {
    setDeletingQBEntry(entryId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/quickbooks/delete-entry?id=${entryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        // Refresh data to show updated list
        await refreshData();
      } else {
        const error = await response.json();
        console.error('Failed to delete QB entry:', error);
      }
    } catch (err) {
      console.error('Failed to delete QB entry:', err);
    } finally {
      setDeletingQBEntry(null);
    }
  };

  const handleDeleteAllQB = async () => {
    setDeletingAllQB(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/quickbooks/delete-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        // Refresh data to show empty QB list
        await refreshData();
        setShowDeleteAllModal(false);
      } else {
        const error = await response.json();
        console.error('Failed to delete all QB entries:', error);
      }
    } catch (err) {
      console.error('Failed to delete all QB entries:', err);
    } finally {
      setDeletingAllQB(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Error Loading Data</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Approve/action toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' :
          toast.type === 'warning' ? 'bg-amber-500 text-white' :
          'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {toast.message}
        </div>
      )}
      {/* QB Connection Status Banner - Clickable to go to Settings */}
      {!loading && qbEntries.length === 0 && (
        <Link href="/settings">
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 text-white cursor-pointer hover:from-red-700 hover:to-red-800 transition-all">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <div>
                  <p className="font-semibold text-sm">No QuickBooks Data Found - Click to Configure</p>
                  <p className="text-xs text-white/90">
                    {qbConnected 
                      ? syncing 
                        ? 'Syncing from QuickBooks Online...' 
                        : 'Connected to QuickBooks but no data synced yet. Click to sync.'
                      : 'Not connected to QuickBooks Online. Click to connect.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {qbConnected ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleAutoSync();
                    }}
                    disabled={syncing}
                    className="px-4 py-2 bg-white text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {syncing ? 'Syncing...' : 'Sync from QuickBooks'}
                  </button>
                ) : (
                  <button className="px-4 py-2 bg-white text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition">
                    Connect QuickBooks
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setShowUploadModal(true);
                  }}
                  className="px-4 py-2 bg-white/20 text-white border border-white/30 rounded-lg hover:bg-white/30 text-sm font-medium transition flex items-center gap-2"
                >
                  <Upload size={14} />
                  Upload .QBO File
                </button>
              </div>
            </div>
          </div>
        </Link>
      )}
      
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">QuickBooks Comparisons</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Intelligent matching between QuickBooks data and cheque extractions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Company switcher — dark-mode variant */}
          <QBCompanySwitcher className="[&>*]:!bg-slate-700 [&>*]:!border-slate-600 [&>*]:!text-slate-200" />
          {/* QB Data Source Toggle */}
          <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setQbDataSource('online')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                qbDataSource === 'online'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              QB Online
            </button>
            <button
              onClick={() => setQbDataSource('uploaded')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                qbDataSource === 'uploaded'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Uploaded
            </button>
            <button
              onClick={() => setQbDataSource('both')}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                qbDataSource === 'both'
                  ? 'bg-blue-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Both
            </button>
          </div>
          
          {/* Delete All QB Data Button */}
          {qbEntries.length > 0 && (
            <button
              onClick={() => setShowDeleteAllModal(true)}
              disabled={deletingAllQB}
              className="px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-500/30 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {deletingAllQB ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete All QB Data
            </button>
          )}

          {/* QB Connection Status Badge */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
              qbConnected 
                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                : qbConfigured
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-700 text-slate-300 border border-slate-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                qbConnected ? 'bg-green-400 animate-pulse' : qbConfigured ? 'bg-amber-400' : 'bg-slate-400'
              }`}></div>
              <span>
                {qbConnected ? 'QB Connected' : qbConfigured ? 'QB Configured' : 'QB Not Setup'}
              </span>
            </div>
            {qbEntries.length > 0 && (
              <div className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium">
                {qbEntries.length} QB {qbEntries.length === 1 ? 'Entry' : 'Entries'}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowColumnSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition text-xs font-medium"
          >
            <Settings size={14} />
            Columns
          </button>
        </div>
      </div>

      <StatisticsPanel
        total={statistics.total}
        matched={statistics.matched}
        mismatched={statistics.mismatched}
        missingInQB={statistics.missingInQB}
        missingInExtraction={statistics.missingInExtraction}
      />

      <ComparisonControlsBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        selectedQBSource={selectedQBSource}
        setSelectedQBSource={setSelectedQBSource}
        qbSources={qbSources}
        selectedPdfName={selectedPdfName}
        setSelectedPdfName={setSelectedPdfName}
        pdfNames={pdfNames}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        accountNames={accountNames}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        showExportDropdown={showExportDropdown}
        setShowExportDropdown={setShowExportDropdown}
        onRefresh={refreshData}
        onUpload={() => setShowUploadModal(true)}
        onExportCSV={handleExportCSV}
        onExportExcel={handleExportExcel}
        onResetFilters={() => { resetFilters(); setShowIssuesOnly(false); }}
        hasActiveFilters={hasActiveFilters}
        showIssuesOnly={showIssuesOnly}
        setShowIssuesOnly={setShowIssuesOnly}
        issueCount={issueCount}
        dateFormat={dateFormat}
        setDateFormat={setDateFormat}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 bg-white mx-4 my-4 rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          <ComparisonTable
            data={comparisonData}
            sortField={sortField}
            sortDirection={sortDirection}
            visibleColumns={visibleColumns}
            dateFormat={dateFormat}
            onSort={handleSort}
            onRowClick={setSelectedRow}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            onVouch={handleVouch}
            onUnvouch={handleUnvouch}
            vouchingId={vouchingId}
            onDeleteQBEntry={handleDeleteQBEntry}
            deletingQBEntry={deletingQBEntry}
          />
          
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
              totalItems={comparisonData.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(count) => {
                setItemsPerPage(count);
                setCurrentPage(1);
              }}
            />
        </div>
      </div>

      <DetailModal 
        row={selectedRow} 
        onClose={() => setSelectedRow(null)} 
        onSave={(checkId, updates) => handleSaveCheck(checkId, updates, selectedRow?.extractionData?.job_id)}
        onApprove={(checkId: string) => handleApproveCheck(checkId, selectedRow?.extractionData?.job_id, selectedRow?.qbData?.id, selectedRow?.extractionData)}
        onReject={(checkId: string) => handleRejectCheck(checkId, selectedRow?.extractionData?.job_id)}
      />
      
      <ColumnSettings
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
      />

      <QBConnectionModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onConnect={() => {
          setShowUploadModal(false);
          refreshData();
        }}
      />

      <DeleteConfirmModal
        isOpen={showDeleteAllModal}
        onClose={() => setShowDeleteAllModal(false)}
        onConfirm={handleDeleteAllQB}
        title="Delete All QuickBooks Data"
        message={`Are you sure you want to delete all ${qbEntries.length} QuickBooks entries? This will remove all QB data from comparisons. This action cannot be undone.`}
        confirmText="Delete All"
        cancelText="Cancel"
      />

      {/* Vouch → Create in QB dialog */}
      {vouchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
              <h2 className="text-white font-bold text-lg">Add to QuickBooks?</h2>
              <p className="text-slate-300 text-sm mt-1">
                Check #{vouchDialog.row.checkNumber} · {vouchDialog.row.amount} is missing in QB.
              </p>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                Would you like to create this check in QuickBooks before vouching, or just mark it as resolved in Kyriq?
              </p>
              <button
                onClick={() => handleVouchConfirm('Deposit')}
                disabled={vouchingToQB}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition disabled:opacity-50 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">D</div>
                <div>
                  <div className="font-semibold text-sm text-gray-800">Create as Deposit</div>
                  <div className="text-xs text-gray-500">Best for received / incoming checks</div>
                </div>
              </button>
              <button
                onClick={() => handleVouchConfirm('Purchase')}
                disabled={vouchingToQB}
                className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition disabled:opacity-50 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">P</div>
                <div>
                  <div className="font-semibold text-sm text-gray-800">Create as Purchase / Check Written</div>
                  <div className="text-xs text-gray-500">Best for outgoing / written checks</div>
                </div>
              </button>
              <button
                onClick={() => handleVouchConfirm('local')}
                disabled={vouchingToQB}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition disabled:opacity-50 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm flex-shrink-0">K</div>
                <div>
                  <div className="font-semibold text-sm text-gray-800">Vouch in Kyriq only</div>
                  <div className="text-xs text-gray-500">Mark as resolved — don't touch QB</div>
                </div>
              </button>
              <button
                onClick={() => setVouchDialog(null)}
                className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 transition py-2"
              >
                Cancel
              </button>
            </div>
            {vouchingToQB && (
              <div className="px-6 pb-4 flex items-center gap-2 text-sm text-blue-600">
                <Loader2 size={14} className="animate-spin" />
                Creating in QuickBooks...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
