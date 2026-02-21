import { useState, useCallback } from 'react';
import { SortField, SortDirection, ComparisonRow } from '../utils/comparisonUtils';

export interface VisibleColumns {
  checkNumber: boolean;
  date: boolean;
  amount: boolean;
  payee: boolean;
  bankAccount: boolean;
  memo: boolean;
  source: boolean;
  matchStatus: boolean;
  confidence: boolean;
  qbSource: boolean;
  actions: boolean;
}

export function useComparisonState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('checkNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedQBSource, setSelectedQBSource] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    checkNumber: true,
    date: true,
    amount: true,
    payee: true,
    bankAccount: true,
    memo: true,
    source: true,
    matchStatus: true,
    confidence: false,
    qbSource: false,
    actions: true,
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ComparisonRow | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterStatus('all');
    setSelectedQBSource('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
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
  };
}
