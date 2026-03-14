'use client'

import { useState, useEffect } from 'react'
import { Calendar, DollarSign, User, Building2, Filter, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface QBAccount {
  id: string
  name: string
  fullName: string
  accountSubType: string
  currentBalance: number
}

interface QuickBooksFiltersProps {
  onApplyFilters: (filters: FilterParams) => void
  isLoading?: boolean
  qbConnected?: boolean
}

export interface FilterParams {
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
  vendor?: string
  account?: string
  type?: 'all' | 'cheque_written' | 'bill_paid_by_cheque' | 'cheque_received'
}

export default function QuickBooksFilters({ onApplyFilters, isLoading, qbConnected }: QuickBooksFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterParams>({
    type: 'all'
  })
  const [qbAccounts, setQbAccounts] = useState<QBAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  // Fetch bank accounts from QuickBooks when connected
  useEffect(() => {
    if (!qbConnected || qbAccounts.length > 0) return
    const fetchAccounts = async () => {
      setLoadingAccounts(true)
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/qbo/accounts', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setQbAccounts(data.accounts || [])
        }
      } catch (err) {
        console.error('Failed to fetch QB accounts:', err)
      } finally {
        setLoadingAccounts(false)
      }
    }
    fetchAccounts()
  }, [qbConnected, qbAccounts.length])

  const handleApply = () => {
    onApplyFilters(filters)
  }

  const handleReset = () => {
    const resetFilters: FilterParams = { type: 'all' }
    setFilters(resetFilters)
    onApplyFilters(resetFilters)
  }

  const hasActiveFilters = () => {
    return !!(
      filters.startDate ||
      filters.endDate ||
      filters.minAmount ||
      filters.maxAmount ||
      filters.vendor ||
      filters.account ||
      (filters.type && filters.type !== 'all')
    )
  }

  // Quick date presets
  const applyDatePreset = (preset: string) => {
    const today = new Date()
    let startDate = ''
    
    switch (preset) {
      case 'today':
        startDate = today.toISOString().split('T')[0]
        setFilters({ ...filters, startDate, endDate: startDate })
        break
      case 'last7':
        const last7 = new Date(today)
        last7.setDate(today.getDate() - 7)
        startDate = last7.toISOString().split('T')[0]
        setFilters({ ...filters, startDate, endDate: today.toISOString().split('T')[0] })
        break
      case 'last30':
        const last30 = new Date(today)
        last30.setDate(today.getDate() - 30)
        startDate = last30.toISOString().split('T')[0]
        setFilters({ ...filters, startDate, endDate: today.toISOString().split('T')[0] })
        break
      case 'last90':
        const last90 = new Date(today)
        last90.setDate(today.getDate() - 90)
        startDate = last90.toISOString().split('T')[0]
        setFilters({ ...filters, startDate, endDate: today.toISOString().split('T')[0] })
        break
      case 'thisMonth':
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        startDate = firstDay.toISOString().split('T')[0]
        setFilters({ ...filters, startDate, endDate: today.toISOString().split('T')[0] })
        break
      case 'lastMonth':
        const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0)
        setFilters({
          ...filters,
          startDate: lastMonthFirst.toISOString().split('T')[0],
          endDate: lastMonthLast.toISOString().split('T')[0]
        })
        break
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-4 h-4" />
          <span>Filter Cheques</span>
          {hasActiveFilters() && (
            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
              Active
            </span>
          )}
        </button>

        {hasActiveFilters() && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" />
            Clear Filters
          </button>
        )}
      </div>

      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
          {/* Date Range Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Calendar className="w-4 h-4" />
              Date Range
            </div>
            
            {/* Quick Date Presets */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => applyDatePreset('today')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => applyDatePreset('last7')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Last 7 Days
              </button>
              <button
                onClick={() => applyDatePreset('last30')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Last 30 Days
              </button>
              <button
                onClick={() => applyDatePreset('last90')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Last 90 Days
              </button>
              <button
                onClick={() => applyDatePreset('thisMonth')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                This Month
              </button>
              <button
                onClick={() => applyDatePreset('lastMonth')}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Last Month
              </button>
            </div>

            {/* Custom Date Range */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                💡 <strong>Tip:</strong> Leave dates empty to pull all available data. Use presets above for quick selection.
              </p>
            </div>
          </div>

          {/* Amount Range Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <DollarSign className="w-4 h-4" />
              Amount Range
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Minimum Amount</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={filters.minAmount || ''}
                  onChange={(e) => setFilters({ ...filters, minAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Maximum Amount</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="999999.99"
                  value={filters.maxAmount || ''}
                  onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Vendor/Payee Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <User className="w-4 h-4" />
              Vendor/Payee
            </div>
            <input
              type="text"
              placeholder="Search by vendor or payee name..."
              value={filters.vendor || ''}
              onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500">Partial matches are supported (e.g., "ABC" will match "ABC Company")</p>
          </div>

          {/* Account Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Building2 className="w-4 h-4" />
              Bank Account
            </div>
            {qbAccounts.length > 0 ? (
              <select
                value={filters.account || ''}
                onChange={(e) => setFilters({ ...filters, account: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Bank Accounts</option>
                {qbAccounts.map((acc) => (
                  <option key={acc.id} value={acc.name}>
                    {acc.fullName} ({acc.accountSubType}) — ${acc.currentBalance?.toLocaleString() ?? '0'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={loadingAccounts ? 'Loading accounts...' : 'Type account name...'}
                  value={filters.account || ''}
                  onChange={(e) => setFilters({ ...filters, account: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loadingAccounts}
                />
                {loadingAccounts && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {qbAccounts.length > 0
                ? `${qbAccounts.length} bank accounts found in QuickBooks`
                : 'Connect to QuickBooks to see available bank accounts'}
            </p>
          </div>

          {/* Transaction Type Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Filter className="w-4 h-4" />
              Transaction Type
            </div>
            <select
              value={filters.type || 'all'}
              onChange={(e) => setFilters({ ...filters, type: e.target.value as FilterParams['type'] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Cheque Types</option>
              <option value="cheque_written">Cheques Written (to vendors)</option>
              <option value="bill_paid_by_cheque">Bills Paid by Cheque</option>
              <option value="cheque_received">Cheques Received (from customers)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleApply}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isLoading ? 'Applying...' : 'Apply Filters'}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters() && (
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Active Filters:</p>
              <div className="flex flex-wrap gap-2">
                {filters.startDate && (
                  <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                    From: {filters.startDate}
                  </span>
                )}
                {filters.endDate && (
                  <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                    To: {filters.endDate}
                  </span>
                )}
                {filters.minAmount && (
                  <span className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                    Min: ${filters.minAmount}
                  </span>
                )}
                {filters.maxAmount && (
                  <span className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                    Max: ${filters.maxAmount}
                  </span>
                )}
                {filters.vendor && (
                  <span className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded">
                    Vendor: {filters.vendor}
                  </span>
                )}
                {filters.account && (
                  <span className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded">
                    Account: {filters.account}
                  </span>
                )}
                {filters.type && filters.type !== 'all' && (
                  <span className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded">
                    Type: {filters.type.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
