import { ComparisonRow, formatCurrency, formatDate } from './comparisonUtils';
import { VisibleColumns } from '../hooks/useComparisonState';

export function exportToCSV(data: ComparisonRow[], visibleColumns: VisibleColumns) {
  const headers: string[] = [];
  const columnKeys: (keyof ComparisonRow)[] = [];

  if (visibleColumns.checkNumber) {
    headers.push('Check Number');
    columnKeys.push('checkNumber');
  }
  if (visibleColumns.date) {
    headers.push('Date');
    columnKeys.push('date');
  }
  if (visibleColumns.amount) {
    headers.push('Amount');
    columnKeys.push('amount');
  }
  if (visibleColumns.payee) {
    headers.push('Payee');
    columnKeys.push('payee');
  }
  if (visibleColumns.bankAccount) {
    headers.push('Bank/Account');
    columnKeys.push('bankAccount');
  }
  if (visibleColumns.memo) {
    headers.push('Memo');
    columnKeys.push('memo');
  }
  if (visibleColumns.source) {
    headers.push('Source');
    columnKeys.push('source');
  }
  if (visibleColumns.matchStatus) {
    headers.push('Match Status');
    columnKeys.push('matchStatus');
  }
  if (visibleColumns.confidence) {
    headers.push('Confidence');
    columnKeys.push('confidence');
  }
  if (visibleColumns.qbSource) {
    headers.push('QB Source');
  }

  const rows = data.map((row) => {
    const rowData: string[] = [];
    
    columnKeys.forEach((key) => {
      let value = row[key];
      if (value === null || value === undefined) {
        rowData.push('');
      } else {
        rowData.push(`"${String(value).replace(/"/g, '""')}"`);
      }
    });

    if (visibleColumns.qbSource) {
      rowData.push(`"${row.qbData?.qbSource || ''}"`);
    }

    return rowData.join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `qb-comparison-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToExcel(data: ComparisonRow[], visibleColumns: VisibleColumns) {
  const headers: string[] = [];
  const columnKeys: (keyof ComparisonRow)[] = [];

  if (visibleColumns.checkNumber) {
    headers.push('Check Number');
    columnKeys.push('checkNumber');
  }
  if (visibleColumns.date) {
    headers.push('Date');
    columnKeys.push('date');
  }
  if (visibleColumns.amount) {
    headers.push('Amount');
    columnKeys.push('amount');
  }
  if (visibleColumns.payee) {
    headers.push('Payee');
    columnKeys.push('payee');
  }
  if (visibleColumns.bankAccount) {
    headers.push('Bank/Account');
    columnKeys.push('bankAccount');
  }
  if (visibleColumns.memo) {
    headers.push('Memo');
    columnKeys.push('memo');
  }
  if (visibleColumns.source) {
    headers.push('Source');
    columnKeys.push('source');
  }
  if (visibleColumns.matchStatus) {
    headers.push('Match Status');
    columnKeys.push('matchStatus');
  }
  if (visibleColumns.confidence) {
    headers.push('Confidence');
    columnKeys.push('confidence');
  }
  if (visibleColumns.qbSource) {
    headers.push('QB Source');
  }

  let html = '<html><head><meta charset="utf-8"></head><body><table border="1">';
  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th style="background-color: #2563eb; color: white; padding: 8px; font-weight: bold;">${header}</th>`;
  });
  html += '</tr></thead><tbody>';

  data.forEach((row) => {
    html += '<tr>';
    
    columnKeys.forEach((key) => {
      let value = row[key];
      if (value === null || value === undefined) {
        html += '<td style="padding: 6px;"></td>';
      } else {
        html += `<td style="padding: 6px;">${String(value)}</td>`;
      }
    });

    if (visibleColumns.qbSource) {
      html += `<td style="padding: 6px;">${row.qbData?.qbSource || ''}</td>`;
    }

    html += '</tr>';
  });

  html += '</tbody></table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `qb-comparison-${new Date().toISOString().split('T')[0]}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
