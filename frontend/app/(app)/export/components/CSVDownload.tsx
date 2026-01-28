'use client';

import { useState } from 'react';
import { Download, FileText, CheckCircle } from 'lucide-react';

interface Check {
  id: string;
  check_number: string;
  payee: string;
  amount: number;
  check_date: string;
  bank_name?: string;
  memo?: string;
}

interface Props {
  checks: Check[];
}

export default function CSVDownload({ checks }: Props) {
  const [downloading, setDownloading] = useState(false);

  const generateCSV = () => {
    const headers = [
      'Check Number',
      'Date',
      'Payee',
      'Amount',
      'Bank',
      'Memo',
      'Status'
    ];

    const rows = checks.map(check => [
      check.check_number || '',
      check.check_date || '',
      check.payee || '',
      check.amount?.toFixed(2) || '0.00',
      check.bank_name || '',
      check.memo || '',
      'Approved'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  };

  const handleDownload = async () => {
    setDownloading(true);

    try {
      const csvContent = generateCSV();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `checks_export_${timestamp}.csv`;
      link.click();
      
      URL.revokeObjectURL(url);

      // Optional: Track export in database
      await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIds: checks.map(c => c.id),
          format: 'csv',
          timestamp: new Date().toISOString()
        })
      });

    } catch (error) {
      console.error('CSV download failed:', error);
      alert('Failed to download CSV. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleQuickBooksFormat = async () => {
    setDownloading(true);

    try {
      // QuickBooks IIF format
      const headers = [
        '!TRNS',
        'TRNSID',
        'TRNSTYPE',
        'DATE',
        'ACCNT',
        'NAME',
        'AMOUNT',
        'DOCNUM',
        'MEMO'
      ];

      const rows = checks.map(check => [
        'TRNS',
        check.id,
        'CHECK',
        check.check_date || '',
        'Checking',
        check.payee || '',
        check.amount?.toFixed(2) || '0.00',
        check.check_number || '',
        check.memo || ''
      ]);

      const iifContent = [
        headers.join('\t'),
        ...rows.map(row => row.join('\t'))
      ].join('\n');

      const blob = new Blob([iifContent], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `quickbooks_import_${timestamp}.iif`;
      link.click();
      
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('QuickBooks format download failed:', error);
      alert('Failed to download QuickBooks file. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-3 mb-4">
        <FileText className="text-blue-600" size={24} />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Export to File</h3>
          <p className="text-sm text-gray-600">Download checks as CSV or QuickBooks format</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium text-gray-900">Standard CSV Export</p>
              <p className="text-sm text-gray-600">Compatible with Excel, Google Sheets</p>
            </div>
            <CheckCircle className="text-green-600" size={20} />
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || checks.length === 0}
            className="w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {downloading ? 'Generating...' : `Download CSV (${checks.length} checks)`}
          </button>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium text-gray-900">QuickBooks IIF Format</p>
              <p className="text-sm text-gray-600">Import directly into QuickBooks Desktop</p>
            </div>
            <CheckCircle className="text-green-600" size={20} />
          </div>
          <button
            onClick={handleQuickBooksFormat}
            disabled={downloading || checks.length === 0}
            className="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {downloading ? 'Generating...' : `Download IIF (${checks.length} checks)`}
          </button>
        </div>
      </div>

      {checks.length === 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          No checks available for export. Approve some checks first.
        </div>
      )}
    </div>
  );
}
