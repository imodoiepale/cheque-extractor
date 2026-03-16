'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Search, Download } from 'lucide-react'

interface QBDataPreviewProps {
  entityType: string
  data: any[]
  totalCount?: number
}

export default function QBDataPreview({ entityType, data, totalCount }: QBDataPreviewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No {entityType} data to display
      </div>
    )
  }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
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

  const filteredData = data.filter(item => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return Object.values(item).some(val => 
      String(val).toLowerCase().includes(searchLower)
    )
  })

  const exportToCSV = () => {
    const columns = getColumns()
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
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder={`Search ${entityType}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          onClick={exportToCSV}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      <div className="text-xs text-gray-600 flex items-center justify-between">
        <span>Showing {filteredData.length} of {totalCount || data.length} records</span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                {getColumns().map((col, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredData.map((item, idx) => {
                const isExpanded = expandedRows.has(item.Id)
                return (
                  <>
                    <tr key={item.Id} className="hover:bg-gray-50 transition">
                      <td className="px-2 py-2">
                        <button
                          onClick={() => toggleRow(item.Id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      {getColumns().map((col, i) => (
                        <td key={i} className="px-3 py-2 text-gray-900 whitespace-nowrap">
                          {col === 'Amount' || col === 'Balance' ? (
                            <span className="font-medium">
                              ${parseFloat(getCellValue(item, col) || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            getCellValue(item, col)
                          )}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={getColumns().length + 1} className="px-4 py-3 bg-gray-50">
                          <div className="text-[10px]">
                            <p className="font-medium text-gray-700 mb-1">Raw JSON Data:</p>
                            <pre className="bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                              {JSON.stringify(item, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
