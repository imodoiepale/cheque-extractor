'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Loader2, AlertCircle, RefreshCw, Upload } from 'lucide-react';
import Link from 'next/link';
import { useComparisonData } from './hooks/useComparisonData';
import { useComparisonState } from './hooks/useComparisonState';
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

export default function QBComparisonsPage() {
  const { loading, extractions, qbEntries, qbSources, error, refreshData } = useComparisonData();
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

  // Check if QuickBooks is configured and connected
  useEffect(() => {
    const checkQBConfig = async () => {
      try {
        const response = await fetch('/api/settings/integrations');
        if (response.ok) {
          const data = await response.json();
          const configured = !!(data.qbClientId || data.qboConnected);
          const connected = !!data.qboConnected;
          setQbConfigured(configured);
          setQbConnected(connected);
          
          console.log('🔐 QB Status:', { configured, connected });
          
          // Auto-sync if connected and no QB entries exist
          if (connected && qbEntries.length === 0 && !autoSyncAttempted) {
            console.log('🔄 Auto-syncing from QuickBooks...');
            setAutoSyncAttempted(true);
            handleAutoSync();
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

  const handleAutoSync = async () => {
    setSyncing(true);
    try {
      console.log('📡 Calling QB pull-checks API...');
      const res = await fetch('/api/qbo/pull-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const comparisonData = useMemo(() => {
    let rows = intelligentMatch(extractions, qbEntries);

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

    rows = filterByDateRange(rows, startDate, endDate);
    rows = filterByQBSource(rows, selectedQBSource);
    rows = sortRows(rows, sortField, sortDirection);

    // Sort matched items to the top
    rows.sort((a, b) => {
      const aMatched = a.matchStatus === 'matched' || a.matchStatus === 'mismatch';
      const bMatched = b.matchStatus === 'matched' || b.matchStatus === 'mismatch';
      if (aMatched && !bMatched) return -1;
      if (!aMatched && bMatched) return 1;
      return 0;
    });

    return rows;
  }, [extractions, qbEntries, searchQuery, filterStatus, startDate, endDate, selectedQBSource, sortField, sortDirection]);

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

  const hasActiveFilters = searchQuery !== '' || filterStatus !== 'all' || selectedQBSource !== 'all' || startDate !== '' || endDate !== '';

  const handleExportCSV = () => {
    exportToCSV(comparisonData, visibleColumns);
    setShowExportDropdown(false);
  };

  const handleExportExcel = () => {
    exportToExcel(comparisonData, visibleColumns);
    setShowExportDropdown(false);
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
      {/* QB Connection Status Banner */}
      {!loading && qbEntries.length === 0 && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} />
              <div>
                <p className="font-semibold text-sm">No QuickBooks Data Found</p>
                <p className="text-xs text-white/90">
                  {qbConnected 
                    ? syncing 
                      ? 'Syncing from QuickBooks Online...' 
                      : 'Connected to QuickBooks but no data synced yet'
                    : 'Not connected to QuickBooks Online'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {qbConnected ? (
                <button
                  onClick={handleAutoSync}
                  disabled={syncing}
                  className="px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
                >
                  {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {syncing ? 'Syncing...' : 'Sync from QuickBooks'}
                </button>
              ) : (
                <Link href="/settings">
                  <button className="px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-orange-50 text-sm font-medium transition">
                    Connect QuickBooks
                  </button>
                </Link>
              )}
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-white/20 text-white border border-white/30 rounded-lg hover:bg-white/30 text-sm font-medium transition flex items-center gap-2"
              >
                <Upload size={14} />
                Upload .QBO File
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">QuickBooks Comparisons</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Intelligent matching between QuickBooks data and cheque extractions
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        showExportDropdown={showExportDropdown}
        setShowExportDropdown={setShowExportDropdown}
        onRefresh={refreshData}
        onUpload={() => setShowUploadModal(true)}
        onExportCSV={handleExportCSV}
        onExportExcel={handleExportExcel}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 bg-white mx-4 my-4 rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          <ComparisonTable
            data={comparisonData}
            sortField={sortField}
            sortDirection={sortDirection}
            visibleColumns={visibleColumns}
            onSort={handleSort}
            onRowClick={setSelectedRow}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
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

      <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      
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
