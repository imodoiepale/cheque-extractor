'use client';

import { useState } from 'react';
import { Check } from '@/types/check';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';
import { Download, FileCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Props {
  checks: Check[];
  hasConnection: boolean;
}

export default function ExportQueue({ checks, hasConnection }: Props) {
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const handleSelectAll = () => {
    if (selectedChecks.length === checks.length) {
      setSelectedChecks([]);
    } else {
      setSelectedChecks(checks.map(c => c.id));
    }
  };

  const handleSelectCheck = (checkId: string) => {
    setSelectedChecks(prev =>
      prev.includes(checkId)
        ? prev.filter(id => id !== checkId)
        : [...prev, checkId]
    );
  };

  const handleExportToQBO = async () => {
    if (!hasConnection) {
      alert('Please connect to QuickBooks Online first');
      return;
    }

    if (selectedChecks.length === 0) {
      alert('Please select checks to export');
      return;
    }

    setExporting(true);
    try {
      const response = await fetch('/api/export/qbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIds: selectedChecks,
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const result = await response.json();

      alert(`Export complete! ${result.successfulCount} of ${result.totalChecks} checks exported successfully.`);
      
      // Refresh page
      window.location.reload();
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (selectedChecks.length === 0) {
      alert('Please select checks to export');
      return;
    }

    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIds: selectedChecks,
        }),
      });

      if (!response.ok) throw new Error('CSV generation failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checks_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export error:', error);
      alert('CSV export failed. Please try again.');
    }
  };

  if (checks.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <FileCheck className="mx-auto text-gray-400 mb-4" size={48} />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Checks Ready</h3>
        <p className="text-gray-600">
          Approve checks in the review workflow to add them to the export queue
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Export Queue</h2>
        <p className="text-sm text-gray-600 mt-1">
          {checks.length} check{checks.length !== 1 ? 's' : ''} ready for export
        </p>
      </div>

      {/* QuickBooks Not Connected Alert */}
      {!hasConnection && checks.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="font-medium text-yellow-900 mb-1">
                  QuickBooks Not Connected
                </p>
                <p className="text-sm text-yellow-800 mb-3">
                  Connect your QuickBooks Online account to export these checks.
                </p>
                <Link
                  href="/settings/integrations"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700"
                >
                  Connect QuickBooks
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="checkbox"
            checked={selectedChecks.length === checks.length}
            onChange={handleSelectAll}
            className="w-5 h-5 text-blue-600 rounded"
          />
          <h3 className="font-semibold">
            Ready to Export ({checks.length})
          </h3>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDownloadCSV}
            disabled={selectedChecks.length === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={18} />
            Download CSV
          </button>
          <button
            onClick={handleExportToQBO}
            disabled={!hasConnection || selectedChecks.length === 0 || exporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={18} />
            {exporting ? 'Exporting...' : 'Export to QuickBooks'}
          </button>
        </div>
      </div>

      {/* Check List */}
      <div className="divide-y">
        {checks.map((check) => (
          <div
            key={check.id}
            className="px-6 py-4 hover:bg-gray-50 flex items-center gap-4"
          >
            <input
              type="checkbox"
              checked={selectedChecks.includes(check.id)}
              onChange={() => handleSelectCheck(check.id)}
              className="w-5 h-5 text-blue-600 rounded"
            />
            
            <div className="flex-1 grid grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Payee</p>
                <p className="font-medium">{check.payee}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount</p>
                <p className="font-medium">{formatCurrency(check.amount || 0)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Date</p>
                <p className="font-medium">{formatDate(check.check_date || '')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Check #</p>
                <p className="font-medium">{check.check_number}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        <p className="text-sm text-gray-600">
          {selectedChecks.length} of {checks.length} checks selected
          {selectedChecks.length > 0 && (
            <span className="ml-4 font-medium">
              Total: {formatCurrency(
                checks
                  .filter(c => selectedChecks.includes(c.id))
                  .reduce((sum, c) => sum + (c.amount || 0), 0)
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}