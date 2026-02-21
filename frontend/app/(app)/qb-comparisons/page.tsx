'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Loader2 } from 'lucide-react';
import { useComparisonData } from './hooks/useComparisonData';
import { useComparisonState } from './hooks/useComparisonState';
import { ComparisonControlsBar } from './components/ComparisonControlsBar';
import { StatisticsPanel } from './components/StatisticsPanel';
import { ComparisonTable } from './components/ComparisonTable';
import { DetailModal } from './components/DetailModal';
import { ColumnSettings } from './components/ColumnSettings';
import { Pagination } from './components/Pagination';
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
  const [checkingConfig, setCheckingConfig] = useState(true);
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

  // Check if QuickBooks is configured
  useEffect(() => {
    const checkQBConfig = async () => {
      try {
        const response = await fetch('/api/settings/integrations');
        if (response.ok) {
          const data = await response.json();
          setQbConfigured(!!(data.qbClientId || data.qboConnected));
        }
      } catch (error) {
        console.error('Failed to check QB config:', error);
      } finally {
        setCheckingConfig(false);
      }
    };
    checkQBConfig();
  }, []);

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
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">QuickBooks Comparisons</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Intelligent matching between QuickBooks data and cheque extractions
          </p>
        </div>
        <button
          onClick={() => setShowColumnSettings(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition text-xs font-medium"
        >
          <Settings size={14} />
          Columns
        </button>
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
    </div>
  );
}
