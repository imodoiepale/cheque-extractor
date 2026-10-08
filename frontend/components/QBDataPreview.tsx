'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp, Search, Download } from 'lucide-react'
import {
  Button, Table, TableEmpty, TableScroll, TableShell, Tbody, Td, Th, Thead, Tr,
} from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Raw QuickBooks entity preview.
 *
 * This table was already DENSE before the redesign — `text-xs` with `px-3 py-2`
 * cells, about 34px a row. The shared Td recipe is `py-3` at `text-sm`, roughly
 * 45px, which would have cost a quarter of the rows on screen. So the dense
 * metrics are declared once here, the way the comparison grid declares its own,
 * rather than by editing the primitive.
 */
const DENSE_CELL = 'px-3 py-2'

interface QBDataPreviewProps {
  entityType: string
  data: any[]
  totalCount?: number
}

export default function QBDataPreview({ entityType, data, totalCount }: QBDataPreviewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const getColumns = () => {
    switch (entityType) {
      case 'Purchase':
        return ['ID', 'Date', 'Amount', 'Vendor', 'Account', 'Payment Type', 'Check #']
      case 'BillPayment':
        return ['ID', 'Date', 'Amount', 'Vendor', 'Account', 'Pay Type', 'Check #']
      case 'Bill':
        return ['ID', 'Date', 'Due Date', 'Amount', 'Vendor', 'Balance']
      case 'Invoice':
        return ['ID', 'Date', 'Due Date', 'Amount', 'Customer', 'Balance']
      case 'Payment':
        return ['ID', 'Date', 'Amount', 'Customer', 'Method', 'Ref #']
      case 'Deposit':
        return ['ID', 'Date', 'Amount', 'Account', 'Memo']
      case 'Transfer':
        return ['ID', 'Date', 'Amount', 'From Account', 'To Account']
      case 'JournalEntry':
        return ['ID', 'Date', 'Amount', 'Memo', 'Lines']
      case 'Vendor':
        return ['ID', 'Name', 'Balance', 'Email', 'Phone']
      case 'Customer':
        return ['ID', 'Name', 'Balance', 'Email', 'Phone']
      case 'Account':
        return ['ID', 'Name', 'Type', 'Balance', 'Active']
      default:
        return ['ID', 'Name', 'Type']
    }
  }

  /** The two money columns. Kept in one place so `numeric` and `.nums-money`
   *  can never be applied to one and not the other. */
  const isMoney = (column: string) => column === 'Amount' || column === 'Balance'

  const getCellValue = (item: any, column: string) => {
    switch (column) {
      case 'ID':
        return item.Id
      case 'Date':
        return item.TxnDate || item.MetaData?.CreateTime?.split('T')[0] || '-'
      case 'Due Date':
        return item.DueDate || '-'
      case 'Amount':
        return item.TotalAmt || item.Total || item.Amount || item.Balance || '-'
      case 'Vendor':
        return item.VendorRef?.name || item.EntityRef?.name || '-'
      case 'Customer':
        return item.CustomerRef?.name || '-'
      case 'Account':
        return item.AccountRef?.name || item.CheckPayment?.BankAccountRef?.name || '-'
      case 'Payment Type':
        return item.PaymentType || '-'
      case 'Pay Type':
        return item.PayType || '-'
      case 'Check #':
        return item.DocNumber || '-'
      case 'Ref #':
        return item.PaymentRefNum || item.DocNumber || '-'
      case 'Method':
        return item.PaymentMethodRef?.name || '-'
      case 'Balance':
        return item.Balance || item.BalanceRemaining || '0'
      case 'From Account':
        return item.FromAccountRef?.name || '-'
      case 'To Account':
        return item.ToAccountRef?.name || '-'
      case 'Memo':
        return item.PrivateNote || item.Memo || '-'
      case 'Lines':
        return item.Line?.length || 0
      case 'Name':
        return item.DisplayName || item.Name || item.FullyQualifiedName || '-'
      case 'Type':
        return item.AccountType || item.Type || item.Classification || '-'
      case 'Email':
        return item.PrimaryEmailAddr?.Address || '-'
      case 'Phone':
        return item.PrimaryPhone?.FreeFormNumber || '-'
      case 'Active':
        return item.Active ? 'Yes' : 'No'
      default:
        return '-'
    }
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-body">
        No {entityType} data to display
      </p>
    )
  }

  const columns = getColumns()

  const filteredData = data.filter(item => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return Object.values(item).some(val =>
      String(val).toLowerCase().includes(searchLower)
    )
  })

  const exportToCSV = () => {
    const csvHeader = columns.join(',')
    const csvRows = filteredData.map(item =>
      columns.map(col => {
        const val = getCellValue(item, col)
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      }).join(',')
    )
    const csv = [csvHeader, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${entityType}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            type="search"
            placeholder={`Search ${entityType}…`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={`Search ${entityType}`}
            className="min-h-input w-full rounded-input border border-glass-hairline bg-white/70 py-2 pl-9 pr-3 text-sm text-ink-strong shadow-inner-track placeholder:text-ink-faint focus:border-brand focus:bg-white/90 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
          />
        </div>
        <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={exportToCSV}>
          Export CSV
        </Button>
      </div>

      <p className="nums text-xs text-ink-faint">
        Showing {filteredData.length.toLocaleString('en-US')} of{' '}
        {(totalCount || data.length).toLocaleString('en-US')} records
      </p>

      {/* `inset` tier: this component is always rendered inside a card, and two
          blurred surfaces stacked directly both go muddy. */}
      <TableShell tier="inset">
        <TableScroll className="max-h-96">
          <Table className="text-xs">
            <Thead>
              <tr>
                <Th className={cn(DENSE_CELL, 'w-8')}><span className="sr-only">Expand</span></Th>
                {columns.map((col) => (
                  <Th
                    key={col}
                    numeric={isMoney(col)}
                    className={cn(DENSE_CELL, 'whitespace-nowrap')}
                  >
                    {col}
                  </Th>
                ))}
              </tr>
            </Thead>
            <Tbody>
              {filteredData.length === 0 ? (
                <TableEmpty
                  colSpan={columns.length + 1}
                  title="No matching records"
                  description="Clear the search to see every record."
                />
              ) : (
                filteredData.map((item) => {
                  const isExpanded = expandedRows.has(item.Id)
                  return (
                    <Fragment key={item.Id}>
                      <Tr interactive>
                        <Td className={DENSE_CELL}>
                          <button
                            type="button"
                            onClick={() => toggleRow(item.Id)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Hide raw record' : 'Show raw record'}
                            className="press text-ink-faint hover:text-ink-strong"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </Td>
                        {columns.map((col) => (
                          <Td
                            key={col}
                            numeric={isMoney(col)}
                            className={cn(DENSE_CELL, 'whitespace-nowrap', isMoney(col) && 'nums-money font-medium')}
                          >
                            {isMoney(col)
                              ? `$${parseFloat(String(getCellValue(item, col)) || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : getCellValue(item, col)}
                          </Td>
                        ))}
                      </Tr>
                      {isExpanded && (
                        <Tr>
                          <Td colSpan={columns.length + 1} className="bg-surface-sunken/70 px-4 py-3">
                            <p className="text-eyebrow text-ink-faint">Raw record</p>
                            <pre className="scroll-region mt-1 max-h-40 rounded-input border border-glass-hairline bg-surface/80 p-2 font-mono text-[10px] text-ink-body">
                              {JSON.stringify(item, null, 2)}
                            </pre>
                          </Td>
                        </Tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </Tbody>
          </Table>
        </TableScroll>
      </TableShell>
    </div>
  )
}
