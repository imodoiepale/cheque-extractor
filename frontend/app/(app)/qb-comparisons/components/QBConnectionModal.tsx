import React, { useState } from 'react';
import { Database, Upload, Settings, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  Button,
  Dialog,
  Field,
  GlassPanel,
  Input,
  Table,
  TableScroll,
  TableShell,
  Tbody,
  Td,
  Th,
  Tr,
} from '@/components/ui';

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

const SOURCES = [
  { value: 'file' as const, label: 'Upload File', icon: Upload },
  { value: 'api' as const, label: 'API Connection', icon: Database },
  { value: 'direct' as const, label: 'Direct QB', icon: Settings },
];

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
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="QuickBooks Connection"
      description="Configure the data source and column mapping."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            loading={uploading}
            disabled={source === 'file' && !file}
          >
            {uploading ? 'Importing…' : uploadResult?.success ? 'Done — Close' : 'Connect & Import'}
          </Button>
        </>
      }
    >
      <div className="scroll-region max-h-[70vh] space-y-5 pr-1">
        {/* Data source */}
        <div>
          <p className="mb-2 text-eyebrow text-ink-faint">Data Source</p>
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map((s) => {
              const active = source === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSource(s.value)}
                  className={`press rounded-input border p-3 text-center ${
                    active
                      ? 'border-brand bg-brand/[0.08] text-brand-deep'
                      : 'border-glass-hairline bg-white/50 text-ink-body hover:bg-white/80'
                  }`}
                >
                  <s.icon size={20} className="mx-auto mb-1.5" aria-hidden />
                  <span className="text-xs font-semibold">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* File upload */}
        {source === 'file' && (
          <div>
            <p className="mb-2 text-eyebrow text-ink-faint">Upload QuickBooks File</p>
            <div className="relative cursor-pointer rounded-card border-2 border-dashed border-glass-hairline bg-white/50 p-6 text-center transition-colors duration-quick ease-settle hover:border-brand hover:bg-brand/[0.04]">
              <input
                type="file"
                accept=".qbo,.ofx,.qfx,.csv,.xlsx,.xls"
                aria-label="QuickBooks file"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <FileText size={32} className="mx-auto mb-2 text-ink-faint" aria-hidden />
              <p className="text-sm font-medium text-ink-strong">
                {file ? file.name : 'Drop a file here or click to browse'}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Supports <strong>.qbo</strong>, <strong>.ofx</strong>, <strong>.qfx</strong>, .csv, .xlsx
              </p>
            </div>

            {file && isQBOFile(file.name) && (
              <GlassPanel tone="plain" radius="input" padding="sm" className="mt-3 text-xs text-ink-body">
                <strong className="text-ink-strong">QBO/OFX file detected</strong> — it will be
                parsed automatically for cheque transactions. No column mapping needed.
              </GlassPanel>
            )}

            {parsing && (
              <p className="mt-3 text-center text-xs text-ink-faint">Parsing file…</p>
            )}

            {previewData.length > 0 && (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-eyebrow text-ink-faint">
                    Preview ({previewData.length} transactions)
                  </p>
                  <span className="text-xs text-ink-faint">Scroll to see more</span>
                </div>
                {/* `inset` tier: this table is already inside the blurred
                    modal, so it must not blur again. */}
                <TableShell tier="inset">
                  <TableScroll className="max-h-64">
                    <Table className="text-xs [&_td]:py-1.5">
                      {/* Plain <thead>, not the `Thead` primitive: `Thead`
                          carries .glass-chrome and this table is already
                          inside the blurred modal (rule 2 — never nest two
                          blurred surfaces). The <th> cells stay the one
                          shared `Th` recipe. */}
                      <thead className="sticky top-0 z-10 bg-surface/95">
                        <tr>
                          <Th>Check #</Th>
                          <Th>Date</Th>
                          <Th numeric>Amount</Th>
                          <Th>Payee</Th>
                          <Th>Memo</Th>
                        </tr>
                      </thead>
                      <Tbody>
                        {previewData.map((entry, idx) => (
                          <Tr key={idx}>
                            <Td className="nums font-medium">{entry.checkNumber || '—'}</Td>
                            <Td muted className="nums">{entry.date || '—'}</Td>
                            <Td className="nums-money font-semibold text-success-text">
                              ${Math.abs(parseFloat(entry.amount) || 0).toFixed(2)}
                            </Td>
                            <Td>{entry.payee || '—'}</Td>
                            <Td muted className="max-w-[150px] truncate">{entry.memo || '—'}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableScroll>
                </TableShell>
              </div>
            )}

            {uploadResult && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-input border px-3 py-2 text-xs ${
                  uploadResult.success
                    ? 'border-success-border bg-success-bg text-success-text'
                    : 'border-error-border bg-error-bg text-error-text'
                }`}
                role="status"
              >
                {uploadResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {uploadResult.message}
              </div>
            )}
          </div>
        )}

        {/* API configuration */}
        {source === 'api' && (
          <div className="space-y-3">
            <Field label="API Endpoint" htmlFor="qb-api-endpoint">
              <Input
                id="qb-api-endpoint"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://api.quickbooks.com/v3/…"
              />
            </Field>
            <Field label="API Key" htmlFor="qb-api-key">
              <Input
                id="qb-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your QuickBooks API key"
              />
            </Field>
          </div>
        )}

        {/* Column mapping — only for CSV/Excel files */}
        {!(file && isQBOFile(file.name)) && (
          <div>
            <p className="mb-1 text-eyebrow text-ink-faint">Column Mapping</p>
            <p className="mb-2 text-xs text-ink-faint">
              Map QuickBooks columns to the expected fields.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(columnMapping).map(([key, value]) => (
                <Field
                  key={key}
                  htmlFor={`qb-col-${key}`}
                  label={<span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>}
                >
                  <Input
                    id={`qb-col-${key}`}
                    inputSize="sm"
                    value={value}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}

        {/* Configuration preview */}
        <GlassPanel radius="input" padding="sm">
          <p className="mb-1.5 text-eyebrow text-ink-faint">Configuration Preview</p>
          <dl className="space-y-1 text-xs text-ink-body">
            <div>
              <dt className="inline font-semibold text-ink-strong">Source: </dt>
              <dd className="inline capitalize">{source}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-ink-strong">Check Number Column: </dt>
              <dd className="inline">{columnMapping.checkNumber}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-ink-strong">Date Column: </dt>
              <dd className="inline">{columnMapping.date}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-ink-strong">Amount Column: </dt>
              <dd className="inline">{columnMapping.amount}</dd>
            </div>
          </dl>
        </GlassPanel>
      </div>
    </Dialog>
  );
};
