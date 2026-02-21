import React from 'react';
import { Search, Upload, Download, ChevronDown, RefreshCw, X, Filter } from 'lucide-react';

interface ComparisonControlsBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  selectedQBSource: string;
  setSelectedQBSource: (source: string) => void;
  qbSources: string[];
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  showExportDropdown: boolean;
  setShowExportDropdown: (show: boolean) => void;
  onRefresh: () => void;
  onUpload: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export const ComparisonControlsBar: React.FC<ComparisonControlsBarProps> = ({
  searchQuery,
  setSearchQuery,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  selectedQBSource,
  setSelectedQBSource,
  qbSources,
  filterStatus,
  setFilterStatus,
  showExportDropdown,
  setShowExportDropdown,
  onRefresh,
  onUpload,
  onExportCSV,
  onExportExcel,
  onResetFilters,
  hasActiveFilters,
}) => {
  return (
    <div className="px-3 py-2 bg-gray-100 border-b border-gray-300">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-3 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search by check #, payee, amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-7 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="col-span-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Start Date"
          />
        </div>

        <div className="col-span-2">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="End Date"
          />
        </div>

        <div className="col-span-2">
          <select
            value={selectedQBSource}
            onChange={(e) => setSelectedQBSource(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All QB Sources</option>
            {qbSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="matched">Matched</option>
            <option value="mismatch">Mismatched</option>
            <option value="missing-in-qb">Missing in QB</option>
            <option value="missing-in-extraction">Missing in Extraction</option>
          </select>
        </div>

        <div className="col-span-1 flex gap-2">
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition"
              title="Reset Filters"
            >
              <Filter size={18} />
            </button>
          )}
        </div>

        <div className="col-span-12 flex gap-2">
          <button
            onClick={onUpload}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium transition shadow-sm"
          >
            <Upload size={16} />
            Upload QB Data
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-xs font-medium transition shadow-sm"
            >
              <Download size={12} />
              Export
              <ChevronDown size={10} />
            </button>

            {showExportDropdown && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button
                  onClick={onExportCSV}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={onExportExcel}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                >
                  <Download size={14} />
                  Export Excel
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs font-medium transition"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
