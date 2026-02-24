import React, { useState } from 'react';
import { X, Database, Upload, Settings, FileText, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

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
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);

  if (!isOpen) return null;

  const isQBOFile = (name: string) => {
    const ext = name.toLowerCase().split('.').pop();
    return ['qbo', 'ofx', 'qfx'].includes(ext || '');
  };

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setUploadResult(null);
    setPreviewData([]);
    
    if (selectedFile && isQBOFile(selectedFile.name)) {
      setParsing(true);
      try {
        const text = await selectedFile.text();
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        const response = await fetch('/api/qbo/upload-file?preview=true', {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        if (response.ok && data.preview) {
          setPreviewData(data.preview); // Show all entries
        }
      } catch (error) {
        console.error('Preview failed:', error);
      } finally {
        setParsing(false);
      }
    }
  };

  const handleSubmit = async () => {
    setUploading(true);
    setUploadResult(null);

    if (source === 'file' && file) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        // Route QBO/OFX/QFX files to the QBO parser, CSV/Excel to the generic upload
        const endpoint = isQBOFile(file.name)
          ? '/api/qbo/upload-file'
          : '/api/quickbooks/upload';

        if (!isQBOFile(file.name)) {
          formData.append('columnMapping', JSON.stringify(columnMapping));
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setUploadResult({
            success: true,
            message: `Imported ${data.imported || data.count || 0} transactions` +
              (data.totalTransactions ? ` (${data.totalTransactions} total in file)` : ''),
            count: data.imported || data.count || 0,
          });
          // Trigger data refresh after successful import
          onConnect({ source, columnMapping });
          
          // Close modal after 2 seconds to show success message
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          setUploadResult({ success: false, message: data.error || 'Upload failed' });
        }
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadResult({ success: false, message: 'Upload failed — check console for details' });
      }
    } else if (source === 'api') {
      onConnect({ source, columnMapping, apiEndpoint, apiKey });
      onClose();
    }

    setUploading(false);
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
                Upload QuickBooks File
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer relative">
                <input
                  type="file"
                  accept=".qbo,.ofx,.qfx,.csv,.xlsx,.xls"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">
                  {file ? file.name : 'Drop a file here or click to browse'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports <strong>.qbo</strong>, <strong>.ofx</strong>, <strong>.qfx</strong>, .csv, .xlsx
                </p>
              </div>
              {file && isQBOFile(file.name) && (
                <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  <strong>QBO/OFX file detected</strong> — will be parsed automatically for cheque transactions. No column mapping needed.
                </div>
              )}
              
              {/* Preview Table */}
              {parsing && (
                <div className="mt-3 text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="text-xs text-gray-600 mt-2">Parsing file...</p>
                </div>
              )}
              
              {previewData.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-gray-700">Preview ({previewData.length} transactions)</h4>
                    <span className="text-xs text-gray-500">Scroll to see more</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">Check #</th>
                            <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">Date</th>
                            <th className="px-2 py-1 text-right font-medium text-gray-700 border-b">Amount</th>
                            <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">Payee</th>
                            <th className="px-2 py-1 text-left font-medium text-gray-700 border-b">Memo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {previewData.map((entry, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-2 py-1 font-medium text-gray-900">{entry.checkNumber || '—'}</td>
                              <td className="px-2 py-1 text-gray-600">{entry.date || '—'}</td>
                              <td className="px-2 py-1 text-right font-semibold text-emerald-700">
                                ${Math.abs(parseFloat(entry.amount) || 0).toFixed(2)}
                              </td>
                              <td className="px-2 py-1 text-gray-900">{entry.payee || '—'}</td>
                              <td className="px-2 py-1 text-gray-600 max-w-[150px] truncate">{entry.memo || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              {uploadResult && (
                <div className={`mt-3 rounded-lg p-3 text-xs flex items-center gap-2 ${
                  uploadResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {uploadResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {uploadResult.message}
                </div>
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

          {/* Column Mapping — only show for CSV/Excel files */}
          {!(file && isQBOFile(file.name)) && <div className={source !== 'file' || !file ? '' : ''}>
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
          </div>}

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
            disabled={(source === 'file' && !file) || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading && <Loader2 size={14} className="animate-spin" />}
            {uploading ? 'Importing...' : uploadResult?.success ? 'Done — Close' : 'Connect & Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
