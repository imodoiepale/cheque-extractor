'use client';

/**
 * OCR Lab. Run one bank statement or check through several extraction
 * engines and compare them with Gemini, the production engine. Admin-only and
 * side-effect free: nothing is saved and nothing counts toward any usage.
 */
import { useState } from 'react';
import { FlaskConical, Upload, Download } from 'lucide-react';
import { Badge, Button, GlassCard, GlassCardEyebrow, GlassCardTitle } from '@/components/ui';
import { cn } from '@/lib/utils';

type DocType = 'statement' | 'check';

const ENGINES: { id: string; name: string; note: string; statementOnly?: boolean }[] = [
  { id: 'gemini', name: 'Gemini Flash', note: 'Production engine, the baseline' },
  { id: 'chandra', name: 'Chandra (Datalab)', note: 'Hosted API, tables and handwriting' },
  { id: 'razor', name: 'Razor Extract', note: 'Bank statements to transactions', statementOnly: true },
  { id: 'unlimited', name: 'Unlimited-OCR (Baidu)', note: 'Self-hosted vLLM endpoint' },
];

interface EngineResult {
  engine: string;
  ok: boolean;
  error: string | null;
  latency_ms: number;
  cost_usd: number | null;
  raw: unknown;
  fields: Record<string, any> | null;
  summary: Record<string, number> | null;
  meta?: Record<string, unknown>;
}

interface LabResponse {
  doc_type: DocType;
  results: EngineResult[];
  agreement: Record<string, Record<string, any>>;
}

const CHECK_FIELDS = ['payee', 'amount', 'checkDate', 'checkNumber', 'bankName', 'memo', 'micr_routing', 'micr_account'];

export default function OcrLabPage() {
  const [docType, setDocType] = useState<DocType>('statement');
  const [file, setFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<string[]>(ENGINES.map((e) => e.id));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LabResponse | null>(null);

  const usable = ENGINES.filter((e) => !(docType === 'check' && e.statementOnly));
  const selected = picked.filter((id) => usable.some((e) => e.id === id));

  async function run() {
    if (!file) return;
    setRunning(true);
    setError(null);
    setData(null);
    const form = new FormData();
    form.append('file', file);
    form.append('doc_type', docType);
    form.append('engines', selected.join(','));
    try {
      const res = await fetch('/api/admin/lab/run', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || body?.message || body?.error || `Lab run failed (${res.status})`);
      setData(body);
    } catch (e: any) {
      setError(e?.message || 'Lab run failed');
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `ocr-lab-${docType}-${Date.now()}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const name = (id: string) => ENGINES.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink-strong flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-brand" aria-hidden /> OCR Lab
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Compare extraction engines on one document against Gemini, the production engine. Nothing here is saved or
          billed to a firm.
        </p>
      </div>

      <GlassCard padding="md" className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Document type">
          {(['statement', 'check'] as DocType[]).map((t) => (
            <button
              key={t}
              onClick={() => setDocType(t)}
              aria-pressed={docType === t}
              className={cn(
                'press rounded-pill px-4 py-2 text-[13px] font-semibold border',
                docType === t ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-soft border-glass-hairline'
              )}
            >
              {t === 'statement' ? 'Bank statement' : 'Single check'}
            </button>
          ))}
        </div>

        <label className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-glass-hairline bg-surface/60 px-6 py-8 text-center cursor-pointer hover:border-brand">
          <Upload className="w-6 h-6 text-brand" aria-hidden />
          <span className="text-sm font-semibold text-ink-strong">{file ? file.name : 'Choose a PDF, PNG or JPG'}</span>
          <span className="text-xs text-ink-faint">Up to 25 MB</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {usable.map((e) => (
            <label key={e.id} className="flex items-start gap-3 rounded-input border border-glass-hairline bg-surface px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.includes(e.id)}
                onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))}
              />
              <span>
                <span className="block text-[13px] font-semibold text-ink-strong">{e.name}</span>
                <span className="block text-[11px] text-ink-faint">{e.note}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={!file || running || selected.length === 0}>
            {running ? 'Running engines…' : `Run ${selected.length} engine${selected.length === 1 ? '' : 's'}`}
          </Button>
          {data && (
            <Button variant="secondary" onClick={download}>
              <Download className="w-4 h-4" aria-hidden /> Download JSON
            </Button>
          )}
          {running && <span className="text-xs text-ink-faint">Hosted engines queue and poll, so a run can take a minute or two.</span>}
        </div>
        {error && <p className="text-sm text-error-text">{error}</p>}
      </GlassCard>

      {data && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.results.map((r) => (
              <GlassCard key={r.engine} padding="md">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <GlassCardTitle>{name(r.engine)}</GlassCardTitle>
                  <Badge tone={r.ok ? 'success' : 'error'} size="sm">{r.ok ? 'ok' : 'failed'}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
                  <dt className="text-ink-faint">Time</dt>
                  <dd className="text-right nums text-ink-strong">{(r.latency_ms / 1000).toFixed(1)}s</dd>
                  <dt className="text-ink-faint">Cost</dt>
                  <dd className="text-right nums text-ink-strong">{r.cost_usd == null ? '—' : `$${r.cost_usd.toFixed(3)}`}</dd>
                  {r.summary &&
                    Object.entries(r.summary).map(([k, v]) => (
                      <SummaryRow key={k} label={k.replace(/_/g, ' ')} value={v} />
                    ))}
                  {r.engine !== 'gemini' && data.agreement[r.engine] && (
                    <>
                      <dt className="text-ink-faint">vs Gemini</dt>
                      <dd className="text-right nums text-ink-strong">{agreementText(data.agreement[r.engine])}</dd>
                    </>
                  )}
                </dl>
                {r.error && <p className="mt-3 text-xs text-error-text break-words">{r.error}</p>}
              </GlassCard>
            ))}
          </div>

          {data.doc_type === 'check' ? <CheckTable data={data} name={name} /> : <StatementTables data={data} name={name} />}

          <GlassCard padding="md">
            <GlassCardEyebrow>Raw output</GlassCardEyebrow>
            <div className="mt-3 space-y-3">
              {data.results.map((r) => (
                <details key={r.engine} className="rounded-input border border-glass-hairline bg-surface">
                  <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold text-ink-strong">{name(r.engine)}</summary>
                  <pre className="max-h-96 overflow-auto px-4 pb-4 text-[11px] leading-relaxed text-ink-body whitespace-pre-wrap">
                    {typeof r.raw === 'string' ? r.raw : JSON.stringify(r.raw, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-ink-faint capitalize">{label}</dt>
      <dd className="text-right nums text-ink-strong">{value}</dd>
    </>
  );
}

function agreementText(a: Record<string, any>) {
  if (Array.isArray(a.agree)) return `${a.agree.length}/${a.of.length} fields`;
  return `${a.shared} shared · ${a.only_engine} extra · ${a.only_baseline} missed`;
}

function CheckTable({ data, name }: { data: LabResponse; name: (id: string) => string }) {
  const base = data.results.find((r) => r.engine === 'gemini')?.fields ?? {};
  const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return (
    <GlassCard padding="md" className="overflow-x-auto">
      <GlassCardEyebrow>Field by field</GlassCardEyebrow>
      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="text-left text-ink-faint">
            <th className="py-2 pr-4 font-semibold">Field</th>
            {data.results.map((r) => <th key={r.engine} className="py-2 pr-4 font-semibold">{name(r.engine)}</th>)}
          </tr>
        </thead>
        <tbody>
          {CHECK_FIELDS.map((f) => (
            <tr key={f} className="border-t border-glass-hairline">
              <td className="py-2 pr-4 text-ink-faint">{f}</td>
              {data.results.map((r) => {
                const v = r.fields?.[f];
                const differs = r.engine !== 'gemini' && norm(v) !== norm(base[f]);
                return (
                  <td key={r.engine} className={cn('py-2 pr-4 text-ink-strong', differs && 'bg-warning-bg')}>
                    {v == null || v === '' ? <span className="text-ink-faint">—</span> : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

function StatementTables({ data, name }: { data: LabResponse; name: (id: string) => string }) {
  return (
    <div className="grid xl:grid-cols-2 gap-3">
      {data.results
        .filter((r) => r.ok && Array.isArray(r.fields?.transactions))
        .map((r) => (
          <GlassCard key={r.engine} padding="md" className="overflow-x-auto">
            <GlassCardEyebrow>{name(r.engine)} · transactions</GlassCardEyebrow>
            <table className="mt-3 w-full text-[12px]">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 pr-3 font-semibold">Description</th>
                  <th className="py-1.5 pr-3 font-semibold">Check #</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Amount</th>
                  <th className="py-1.5 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(r.fields!.transactions as any[]).slice(0, 300).map((t, i) => (
                  <tr key={i} className="border-t border-glass-hairline">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{t.date ?? '—'}</td>
                    <td className="py-1.5 pr-3">{t.description ?? ''}</td>
                    <td className="py-1.5 pr-3 nums">{t.check_number ?? ''}</td>
                    <td className="py-1.5 pr-3 text-right nums">{t.amount ?? ''}</td>
                    <td className="py-1.5 text-right nums">{t.balance ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        ))}
    </div>
  );
}
