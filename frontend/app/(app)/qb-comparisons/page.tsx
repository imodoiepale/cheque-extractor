'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Loader2, AlertCircle, RefreshCw, Upload } from 'lucide-react';
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

  const handleSaveCheck = async (checkId: string, updates: any) => {
    try {
      console.log('💾 Saving check edits:', checkId, updates);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/checks/${checkId}/update`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save check');
      }

      const data = await res.json();
      console.log('✅ Check saved successfully:', data);
      
      // Refresh data to show updated values
      await refreshData();
      
      return data;
    } catch (error: any) {
      console.error('❌ Failed to save check:', error);
      throw error;
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
      const data = await res.json();
      console.log('✅ QB Sync result:', data);
      if (res.ok) {
        await refreshData();
      }
    } catch (err) {
      console.error('❌ Auto-sync failed:', err);
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

  const handleVouch = async (row: ComparisonRow) => {
    setVouchingId(row.id);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/checks/vouch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          checkIdentifier: row.id,
          checkNumber: row.checkNumber,
        }),
      });

      if (response.ok) {
        // Update local vouched map
        setVouchedMap(prev => ({
          ...prev,
          [row.id]: {
            vouchedBy: session.user.id,
            vouchedAt: new Date().toISOString(),
          },
        }));
      }
    } catch (err) {
      console.error('Failed to vouch check:', err);
    } finally {
      setVouchingId(null);
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

  {/* QB Not Connected Banner */}
  {!qbConnected && !checkingConfig && (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 text-sm">No QuickBooks Data Found</h3>
          <p className="text-red-700 text-xs mt-1">
            {!qbConfigured 
              ? 'QuickBooks credentials not configured. Please set up your QB credentials first.'
              : 'Not connected to QuickBooks Online. Connect to start comparing data.'}
          </p>
          <div className="mt-3 space-y-2 text-xs text-red-800">
            <p className="font-medium">To connect QuickBooks:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Go to Settings → Integrations</li>
              <li>Configure your QB credentials (Client ID, Secret, Redirect URI)</li>
              <li>Click "Connect to QuickBooks"</li>
              <li>Select your company when prompted</li>
              <li>Pull data to populate this comparison table</li>
            </ol>
          </div>
        </div>
        <Link
          href="/settings?tab=integrations"
          className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-2 whitespace-nowrap"
        >
          <Settings size={16} />
          {!qbConfigured ? 'Configure' : 'Connect QB'}
        </Link>
      </div>
    </div>
  )}
  
  {/* QB Connected but No Data */}
  {qbConnected && qbEntries.length === 0 && !loading && (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 text-sm">QuickBooks Connected - No Data Pulled</h3>
          <p className="text-amber-700 text-xs mt-1">
            You're connected to QuickBooks, but no check data has been pulled yet.
          </p>
          <div className="mt-3 text-xs text-amber-800">
            <p className="font-medium mb-1">Next step:</p>
            <p>Go to Settings → Integrations → "Fetch QuickBooks Data" and click "Pull Data from QuickBooks"</p>
          </div>
        </div>
        <Link
          href="/settings?tab=integrations"
          className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 flex items-center gap-2 whitespace-nowrap"
        >
          <RefreshCw size={16} />
          Pull Data
        </Link>
      </div>
    </div>
  )}

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
        onSave={handleSaveCheck}
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
    </div>
  );
}
