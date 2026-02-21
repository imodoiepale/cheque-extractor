import React, { useState } from 'react';
import { X, Database, Upload, Settings } from 'lucide-react';

interface QBConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (config: QBConfig) => void;
}

export interface QBConfig {
  source: 'file' | 'api' | 'direct';
  columnMapping: {
    checkNumber: string;
    date: string;
    amount: string;
    payee: string;
    account: string;
    memo: string;
  };
  apiEndpoint?: string;
  apiKey?: string;
}

export const QBConnectionModal: React.FC<QBConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnect,
}) => {
  const [source, setSource] = useState<'file' | 'api' | 'direct'>('file');
  const [columnMapping, setColumnMapping] = useState({
    checkNumber: 'Check Number',
    date: 'Date',
    amount: 'Amount',
    payee: 'Payee',
    account: 'Account',
    memo: 'Memo',
  });
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (source === 'file' && file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('columnMapping', JSON.stringify(columnMapping));

      try {
        const response = await fetch('/api/quickbooks/upload', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          onConnect({ source, columnMapping });
          onClose();
        }
      } catch (error) {
        console.error('Upload failed:', error);
      }
    } else if (source === 'api') {
      onConnect({ source, columnMapping, apiEndpoint, apiKey });
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <Database size={24} />
            <div>
              <h3 className="text-lg font-bold">QuickBooks Connection</h3>
              <p className="text-sm text-blue-100">Configure data source and column mapping</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Data Source Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Data Source</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setSource('file')}
                className={`p-4 border-2 rounded-lg transition ${
                  source === 'file'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Upload size={20} className="mx-auto mb-2" />
                <div className="text-xs font-medium">Upload File</div>
              </button>
              <button
                onClick={() => setSource('api')}
                className={`p-4 border-2 rounded-lg transition ${
                  source === 'api'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Database size={20} className="mx-auto mb-2" />
                <div className="text-xs font-medium">API Connection</div>
              </button>
              <button
                onClick={() => setSource('direct')}
                className={`p-4 border-2 rounded-lg transition ${
                  source === 'direct'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Settings size={20} className="mx-auto mb-2" />
                <div className="text-xs font-medium">Direct QB</div>
              </button>
            </div>
          </div>

          {/* File Upload */}
          {source === 'file' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Upload QuickBooks Export (CSV/Excel)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {file.name}
                </p>
              )}
            </div>
          )}

          {/* API Configuration */}
          {source === 'api' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Endpoint
                </label>
                <input
                  type="text"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.quickbooks.com/v3/..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your QuickBooks API key"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Column Mapping */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Column Mapping
              <span className="ml-2 text-xs font-normal text-gray-500">
                Map QuickBooks columns to expected fields
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(columnMapping).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setColumnMapping({ ...columnMapping, [key]: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Configuration Preview</h4>
            <div className="space-y-1 text-xs text-gray-600">
              <div><span className="font-medium">Source:</span> {source}</div>
              <div><span className="font-medium">Check Number Column:</span> {columnMapping.checkNumber}</div>
              <div><span className="font-medium">Date Column:</span> {columnMapping.date}</div>
              <div><span className="font-medium">Amount Column:</span> {columnMapping.amount}</div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={source === 'file' && !file}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect & Import
          </button>
        </div>
      </div>
    </div>
  );
};
