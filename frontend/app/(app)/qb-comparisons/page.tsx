'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Settings, Loader2, AlertCircle, RefreshCw, Upload, Wrench } from 'lucide-react';
import { Badge, Button, Dialog, GlassCard, Toast } from '@/components/ui';
import { applyFixesToQB, computeCorrections } from './utils/fixDiscrepancy';
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
import { HeaderOverflowMenu } from './components/HeaderOverflowMenu';
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

/** The three outcomes of vouching a cheque that QuickBooks does not have. */
const VOUCH_TARGETS = [
  { kind: 'Deposit' as const, glyph: 'D', title: 'Create as Deposit', hint: 'Best for received / incoming cheques' },
  { kind: 'Purchase' as const, glyph: 'P', title: 'Create as Purchase / Cheque Written', hint: 'Best for outgoing / written cheques' },
  { kind: 'local' as const, glyph: 'K', title: 'Vouch in Kyriq only', hint: "Mark as resolved — don't touch QB" },
];

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
  const [fixingAll, setFixingAll] = useState(false);
  const [fixAllProgress, setFixAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [showFixAllConfirm, setShowFixAllConfirm] = useState(false);

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
        showToast('warning',
          qbEntryId
            ? `Approved in Kyriq ✓ — QB sync skipped: ${qbSync?.message || 'unknown reason'}`
            : 'Approved in Kyriq ✓ — no QuickBooks transaction linked, so it cannot be cleared in QB. Use "Find in QB" to link first.'
        );
        break;
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

  const handleFixAllDiscrepancies = async () => {
    const candidates = comparisonData.filter((r) => {
      if (r.matchStatus !== 'mismatch' || !r.qbData) return false;
      return Object.keys(computeCorrections(r)).length > 0;
    });
    if (candidates.length === 0) {
      showToast('warning', 'No discrepancies with actionable differences to fix.');
      setShowFixAllConfirm(false);
      return;
    }
    setFixingAll(true);
    setFixAllProgress({ done: 0, total: candidates.length });
    try {
      const result = await applyFixesToQB(candidates, (done, total) => {
        setFixAllProgress({ done, total });
      });
      const parts: string[] = [];
      if (result.fixed > 0)   parts.push(`${result.fixed} fixed in QB`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (no diffs)`);
      if (result.failed > 0)  parts.push(`${result.failed} failed`);
      const msg = parts.join(' · ') || 'No changes made';
      const type: 'success' | 'warning' | 'error' =
        result.failed > 0 ? 'error' : (result.fixed > 0 ? 'success' : 'warning');
      showToast(type, msg);
      if (result.errors.length > 0) console.warn('Fix-All errors:', result.errors);
      await refreshData();
    } catch (e: any) {
      showToast('error', e?.message || 'Fix-All failed');
    } finally {
      setFixingAll(false);
      setFixAllProgress(null);
      setShowFixAllConfirm(false);
    }
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

  // Mismatches that have real differences to push to QB. Drives the one
  // "Fix All" button in the header — it replaces the old warning bar, which
  // spent a full row explaining a number the button already carries.
  const fixableCount = useMemo(
    () => comparisonData.filter(r =>
      r.matchStatus === 'mismatch' && r.qbData && Object.keys(computeCorrections(r)).length > 0
    ).length,
    [comparisonData]
  );

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
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <GlassCard padding="lg" className="max-w-md text-center" reveal>
          <h1 className="font-heading text-2xl font-semibold text-error-text">
            Error Loading Data
          </h1>
          <p className="mt-2 text-sm text-ink-body">{error}</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    /* One scroll container on this page: below md the document scrolls and the
       grid is height-capped; from md up the page is pinned to the viewport and
       the ONLY scrollbar is the table's own (see ComparisonTable). */
    <div data-tone="brand" className="flex flex-col pb-4 md:h-screen md:overflow-hidden md:pb-0">
      {toast && (
        <div className="fixed right-4 top-4 z-[9999] w-[min(28rem,calc(100vw-2rem))]">
          <Toast
            tone={toast.type === 'success' ? 'success' : toast.type === 'warning' ? 'warning' : 'error'}
            title={toast.message}
          />
        </div>
      )}

      {/* QB connection banner — the one place on this page allowed to shout,
          so it is a solid state surface rather than glass. */}
      {!loading && qbEntries.length === 0 && (
        <div className="mx-4 mt-3 rounded-card border border-error-border bg-error-bg px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/settings" className="flex min-w-0 items-center gap-3">
              <AlertCircle size={20} className="shrink-0 text-error-text" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-error-text">
                  No QuickBooks data found — click to configure
                </p>
                <p className="text-xs text-ink-body">
                  {qbConnected
                    ? syncing
                      ? 'Syncing from QuickBooks Online…'
                      : 'Connected to QuickBooks but no data synced yet. Click to sync.'
                    : 'Not connected to QuickBooks Online. Click to connect.'}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {qbConnected && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAutoSync}
                  loading={syncing}
                  icon={<RefreshCw size={14} />}
                >
                  {syncing ? 'Syncing…' : 'Sync from QuickBooks'}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowUploadModal(true)}
                icon={<Upload size={14} />}
              >
                Upload .QBO File
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Page chrome. Light glass, not the old navy slab: the dark shell is
          what makes these surfaces read as elevated. */}
      <GlassCard tier="chrome" padding="sm" className="mx-4 mt-3 rounded-card border">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-heading text-xl font-semibold text-ink-strong">
              QuickBooks Comparisons
            </h1>

            {/* The counts, as filtering chips rather than five KPI tiles. */}
            <StatisticsPanel
              total={statistics.total}
              matched={statistics.matched}
              mismatched={statistics.mismatched}
              missingInQB={statistics.missingInQB}
              missingInExtraction={statistics.missingInExtraction}
              filterStatus={filterStatus}
              onSelectStatus={(status) => {
                setFilterStatus(status);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <QBCompanySwitcher />

            {/* QB data source — a segmented control on a recessed track. */}
            <div className="glass-track inline-flex items-center rounded-pill p-1">
              {(['online', 'uploaded', 'both'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  aria-pressed={qbDataSource === src}
                  onClick={() => setQbDataSource(src)}
                  className={`press rounded-pill px-3 py-1 text-xs font-medium capitalize ${
                    qbDataSource === src
                      ? 'bg-brand text-white shadow-brand-glow'
                      : 'text-ink-body hover:text-ink-strong'
                  }`}
                >
                  {src === 'online' ? 'QB Online' : src}
                </button>
              ))}
            </div>

            {/* Connection state and synced volume in one mark, not two. */}
            <Badge
              tone={qbConnected ? 'success' : qbConfigured ? 'warning' : 'neutral'}
              className="nums"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  qbConnected ? 'animate-pulse bg-success' : qbConfigured ? 'bg-warning' : 'bg-ink-faint'
                }`}
                aria-hidden
              />
              {qbConnected ? 'QB Connected' : qbConfigured ? 'QB Configured' : 'QB Not Setup'}
              {qbEntries.length > 0 && ` · ${qbEntries.length} entries`}
            </Badge>

            {fixableCount > 0 && (
              <Button
                size="sm"
                onClick={() => setShowFixAllConfirm(true)}
                loading={fixingAll}
                icon={<Wrench size={14} />}
                title="Push extraction values (amount, date, check #) to QuickBooks for mismatched rows"
              >
                {fixingAll && fixAllProgress
                  ? `Fixing ${fixAllProgress.done}/${fixAllProgress.total}…`
                  : `Fix All (${fixableCount})`}
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowColumnSettings(true)}
              icon={<Settings size={14} />}
            >
              Columns
            </Button>

            <HeaderOverflowMenu
              dateFormat={dateFormat}
              setDateFormat={setDateFormat}
              onDeleteAll={
                qbEntries.length > 0 && !deletingAllQB
                  ? () => setShowDeleteAllModal(true)
                  : undefined
              }
            />
          </div>
        </div>
      </GlassCard>

      {/* Fix All confirmation */}
      <Dialog
        open={showFixAllConfirm}
        onClose={() => !fixingAll && setShowFixAllConfirm(false)}
        size="md"
        title="Fix All Discrepancies in QuickBooks?"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFixAllConfirm(false)}
              disabled={fixingAll}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleFixAllDiscrepancies}
              loading={fixingAll}
              icon={<Wrench size={14} />}
            >
              {fixingAll
                ? `Fixing ${fixAllProgress?.done || 0}/${fixAllProgress?.total || 0}…`
                : 'Fix All'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-body">
          This will push the cheque extraction values (amount, date, check #) to QuickBooks for
          every mismatched row that has actual differences. Rows with no diffs will be skipped.
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          Note: BillPayment amounts cannot be changed via the QuickBooks API. Those rows will be
          reported as failed — adjust the linked Bill in QuickBooks instead.
        </p>
      </Dialog>

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
      />

      {/* The grid. Its glass shell is the surface; the pagination bar rides
          inside it so there is no second stacked card. */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
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
          footer={
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
          }
        />
      </div>

      <DetailModal
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onSave={(checkId, updates) => handleSaveCheck(checkId, updates, selectedRow?.extractionData?.job_id)}
        onApprove={(checkId: string) => handleApproveCheck(checkId, selectedRow?.extractionData?.job_id, selectedRow?.qbData?.id, selectedRow?.extractionData)}
        onReject={(checkId: string) => handleRejectCheck(checkId, selectedRow?.extractionData?.job_id)}
        onFixed={() => { refreshData(); }}
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

      {/* Vouch → create in QB */}
      <Dialog
        open={Boolean(vouchDialog)}
        onClose={() => setVouchDialog(null)}
        size="md"
        title="Add to QuickBooks?"
        description={
          vouchDialog
            ? `Check #${vouchDialog.row.checkNumber} · ${vouchDialog.row.amount} is missing in QB.`
            : undefined
        }
      >
        <p className="mb-4 text-sm text-ink-body">
          Would you like to create this check in QuickBooks before vouching, or just mark it as
          resolved in Kyriq?
        </p>
        <div className="space-y-2">
          {VOUCH_TARGETS.map((target) => (
            <button
              key={target.kind}
              type="button"
              onClick={() => handleVouchConfirm(target.kind)}
              disabled={vouchingToQB}
              className="press flex w-full items-center gap-3 rounded-input border border-glass-hairline bg-white/60 px-4 py-3 text-left hover:bg-white/90 disabled:opacity-disabled"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/[0.12] text-sm font-bold text-brand-deep">
                {target.glyph}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-strong">{target.title}</span>
                <span className="block text-xs text-ink-faint">{target.hint}</span>
              </span>
            </button>
          ))}
          <Button block variant="ghost" size="sm" onClick={() => setVouchDialog(null)}>
            Cancel
          </Button>
        </div>
        {vouchingToQB && (
          <p className="mt-3 flex items-center gap-2 text-sm text-brand-deep">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Creating in QuickBooks…
          </p>
        )}
      </Dialog>
    </div>
  );
}
