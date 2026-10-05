'use client'

import { useState, useEffect } from 'react'
import { Calendar, DollarSign, User, Building2, Filter, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Badge, Button, Field, GlassPanel, Input, Select,
} from '@/components/ui'

/**
 * Cheque pull filters.
 *
 * Rendered inside the Settings card, so the open panel is a GlassPanel (no
 * backdrop-filter of its own) rather than a second blurred surface — two
 * blurred surfaces stacked directly both go muddy.
 *
 * The active-filter chips used six different raw palette families to tell the
 * groups apart. Glass is neutral and colour marks state, not category, so they
 * are all one neutral `outline` badge now and the LABEL does the telling.
 */

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
  type?: 'all' | 'cheque_written' | 'bill_paid_by_cheque' | 'cheque_received' | 'payroll_check'
}

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
] as const

export default function QuickBooksFilters({ onApplyFilters, isLoading, qbConnected }: QuickBooksFiltersProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterParams>({ type: 'all' })
  const [qbAccounts, setQbAccounts] = useState<QBAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

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

  const handleApply = () => onApplyFilters(filters)

  const handleReset = () => {
    const resetFilters: FilterParams = { type: 'all' }
    setFilters(resetFilters)
    onApplyFilters(resetFilters)
  }

  const hasActiveFilters = () => !!(
    filters.startDate ||
    filters.endDate ||
    filters.minAmount ||
    filters.maxAmount ||
    filters.vendor ||
    filters.account ||
    (filters.type && filters.type !== 'all')
  )

  const applyDatePreset = (preset: string) => {
    const today = new Date()
    const iso = (d: Date) => d.toISOString().split('T')[0]
    const back = (days: number) => {
      const d = new Date(today)
      d.setDate(today.getDate() - days)
      return d
    }

    switch (preset) {
      case 'today':
        setFilters({ ...filters, startDate: iso(today), endDate: iso(today) })
        break
      case 'last7':
        setFilters({ ...filters, startDate: iso(back(7)), endDate: iso(today) })
        break
      case 'last30':
        setFilters({ ...filters, startDate: iso(back(30)), endDate: iso(today) })
        break
      case 'last90':
        setFilters({ ...filters, startDate: iso(back(90)), endDate: iso(today) })
        break
      case 'thisMonth':
        setFilters({
          ...filters,
          startDate: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
          endDate: iso(today),
        })
        break
      case 'lastMonth':
        setFilters({
          ...filters,
          startDate: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
          endDate: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
        })
        break
    }
  }

  /** Every active filter, as one neutral chip list. Label tells, not colour. */
  const activeChips = [
    filters.startDate && `From ${filters.startDate}`,
    filters.endDate && `To ${filters.endDate}`,
    filters.minAmount && `Min $${filters.minAmount}`,
    filters.maxAmount && `Max $${filters.maxAmount}`,
    filters.vendor && `Vendor: ${filters.vendor}`,
    filters.account && `Account: ${filters.account}`,
    filters.type && filters.type !== 'all' && `Type: ${filters.type.replace(/_/g, ' ')}`,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          size="sm"
          variant="secondary"
          icon={<Filter className="h-4 w-4" />}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          Filter cheques
          {hasActiveFilters() && (
            <Badge tone="brand" size="sm" className="nums ml-1">{activeChips.length}</Badge>
          )}
        </Button>

        {hasActiveFilters() && (
          <button
            type="button"
            onClick={handleReset}
            className="press inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink-strong"
          >
            <X className="h-4 w-4" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      {showFilters && (
        <GlassPanel tone="neutral" radius="card" padding="lg" className="space-y-6">
          {/* ── Date range ────────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-body">
              <Calendar className="h-4 w-4" aria-hidden /> Date range
            </h3>

            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyDatePreset(p.key)}
                  className="press rounded-full border border-glass-hairline bg-surface/70 px-3 py-1 text-xs font-medium text-ink-body hover:bg-brand/[0.06] hover:text-ink-strong"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="qbf-start">
                <Input
                  id="qbf-start"
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </Field>
              <Field label="End date" htmlFor="qbf-end">
                <Input
                  id="qbf-end"
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </Field>
            </div>
            <p className="rounded-input border border-info-border bg-info-bg px-2 py-1 text-xs text-info-text">
              Leave both dates empty to pull all available data.
            </p>
          </section>

          {/* ── Amount range ──────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-body">
              <DollarSign className="h-4 w-4" aria-hidden /> Amount range
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Minimum amount" htmlFor="qbf-min">
                <Input
                  id="qbf-min"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="nums"
                  value={filters.minAmount ?? ''}
                  onChange={(e) => setFilters({ ...filters, minAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </Field>
              <Field label="Maximum amount" htmlFor="qbf-max">
                <Input
                  id="qbf-max"
                  type="number"
                  step="0.01"
                  placeholder="999999.99"
                  className="nums"
                  value={filters.maxAmount ?? ''}
                  onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                />
              </Field>
            </div>
          </section>

          {/* ── Vendor / payee ────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-body">
              <User className="h-4 w-4" aria-hidden /> Vendor / payee
            </h3>
            <Field
              htmlFor="qbf-vendor"
              hint={'Partial matches work — "ABC" matches "ABC Company".'}
            >
              <Input
                id="qbf-vendor"
                placeholder="Search by vendor or payee name…"
                value={filters.vendor || ''}
                onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
              />
            </Field>
          </section>

          {/* ── Bank account ──────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-body">
              <Building2 className="h-4 w-4" aria-hidden /> Bank account
            </h3>
            {qbAccounts.length > 0 ? (
              <Field
                htmlFor="qbf-account"
                hint={`${qbAccounts.length} bank account${qbAccounts.length !== 1 ? 's' : ''} found in QuickBooks.`}
              >
                <Select
                  id="qbf-account"
                  value={filters.account || ''}
                  onChange={(e) => setFilters({ ...filters, account: e.target.value })}
                >
                  <option value="">All bank accounts</option>
                  {qbAccounts.map((acc) => (
                    <option key={acc.id} value={acc.name}>
                      {acc.fullName} ({acc.accountSubType}) — ${acc.currentBalance?.toLocaleString('en-US') ?? '0'}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field
                htmlFor="qbf-account-text"
                hint="Connect QuickBooks to pick from the real account list."
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="qbf-account-text"
                    placeholder={loadingAccounts ? 'Loading accounts…' : 'Type account name…'}
                    value={filters.account || ''}
                    onChange={(e) => setFilters({ ...filters, account: e.target.value })}
                    disabled={loadingAccounts}
                  />
                  {loadingAccounts && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-faint" aria-label="Loading accounts" />
                  )}
                </div>
              </Field>
            )}
          </section>

          {/* ── Transaction type ──────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-body">
              <Filter className="h-4 w-4" aria-hidden /> Transaction type
            </h3>
            <Field htmlFor="qbf-type">
              <Select
                id="qbf-type"
                value={filters.type || 'all'}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as FilterParams['type'] })}
              >
                <option value="all">All cheque types</option>
                <option value="cheque_written">Cheques written (to vendors)</option>
                <option value="bill_paid_by_cheque">Bills paid by cheque</option>
                <option value="cheque_received">Cheques received (from customers)</option>
                <option value="payroll_check">Payroll checks</option>
              </Select>
            </Field>
          </section>

          {/* ── Actions ───────────────────────────── */}
          <div className="flex gap-3 border-t border-glass-hairline pt-4">
            <Button size="sm" block loading={isLoading} onClick={handleApply}>
              {isLoading ? 'Applying…' : 'Apply filters'}
            </Button>
            <Button size="sm" variant="secondary" disabled={isLoading} onClick={handleReset}>
              Reset
            </Button>
          </div>

          {activeChips.length > 0 && (
            <div className="border-t border-glass-hairline pt-4">
              <p className="text-eyebrow text-ink-faint">Active filters</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {activeChips.map(chip => (
                  <li key={chip}>
                    <Badge tone="outline" size="sm">{chip}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  )
}
