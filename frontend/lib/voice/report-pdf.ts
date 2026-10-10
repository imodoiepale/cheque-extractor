/**
 * Kyriq report PDFs, built in the browser with jsPDF + autotable (the same
 * approach as RIAS's lib/table/export.ts): an indigo header band with the
 * logo, a summary strip, a zebra table and page footers. Libraries load on
 * demand so they never weigh on the main bundle.
 */

export type ReportRow = {
  confidence_score?: number | string | null;
  status?: string | null;
  discrepancy_type?: string | null;
  discrepancy_amount?: number | string | null;
  flagged_reason?: string | null;
  checks?: { check_number?: string | null; payee?: string | null; amount?: number | string | null; check_date?: string | null } | null;
};

export type ReportInput = {
  title: string;
  firmName?: string;
  rows: ReportRow[];
  summary?: { total?: number; exact_100?: number; below_90?: number; by_status?: Record<string, number> };
};

const INDIGO = '#6366f1';
const EMERALD = '#10b981';
const INK = '#0f172a';

const money = (v: unknown) =>
  v == null || v === '' ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(v));
const date = (v?: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch('/brand/kyriq-logo-white.png')).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Returns the PDF as a Blob plus base64 (for emailing). */
export async function buildReportPdf(input: ReportInput): Promise<{ blob: Blob; base64: string; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const generated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  // Header band: indigo with an emerald rule, like the email shell.
  doc.setFillColor(INDIGO);
  doc.rect(0, 0, W, 62, 'F');
  doc.setFillColor(EMERALD);
  doc.rect(0, 62, W, 3, 'F');
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', 36, 16, 73, 30);
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(input.title, logo ? 124 : 36, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${input.firmName ? `${input.firmName} · ` : ''}${input.rows.length.toLocaleString('en-US')} rows`, logo ? 124 : 36, 45);
  doc.text(`Generated ${generated}`, W - 36, 45, { align: 'right' });

  // Summary strip.
  let y = 86;
  if (input.summary) {
    const s = input.summary;
    const tiles = [
      ['Total matches', s.total ?? 0],
      ['Exact (100%)', s.exact_100 ?? 0],
      ['Below 90%', s.below_90 ?? 0],
      ['Discrepancies', s.by_status?.discrepancy ?? 0],
      ['Approved', s.by_status?.approved ?? 0],
    ] as const;
    const tw = (W - 72 - 4 * 10) / tiles.length;
    tiles.forEach(([label, value], i) => {
      const x = 36 + i * (tw + 10);
      doc.setFillColor('#f3f3fe');
      doc.roundedRect(x, y, tw, 40, 6, 6, 'F');
      doc.setTextColor('#64748b');
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x + 10, y + 14);
      doc.setTextColor(INK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(Number(value).toLocaleString('en-US'), x + 10, y + 32);
      doc.setFont('helvetica', 'normal');
    });
    y += 56;
  }

  autoTable(doc, {
    startY: y,
    head: [['Check #', 'Payee', 'Date', 'Amount', 'Match', 'Status', 'Discrepancy', 'Off by', 'Note']],
    body: input.rows.map((r) => [
      r.checks?.check_number ?? '',
      r.checks?.payee ?? '',
      date(r.checks?.check_date),
      money(r.checks?.amount),
      r.confidence_score == null ? '' : `${Math.round(Number(r.confidence_score))}%`,
      r.status ?? '',
      r.discrepancy_type ?? '',
      money(r.discrepancy_amount),
      r.flagged_reason ?? '',
    ]),
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, lineColor: '#e2e8f0', lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: INK, textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: '#f8f8ff' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 7: { halign: 'right' } },
    margin: { left: 36, right: 36, bottom: 40 },
    didDrawPage: (data) => {
      doc.setFontSize(7.5);
      doc.setTextColor('#94a3b8');
      doc.text(`Page ${data.pageNumber}`, W - 36, H - 20, { align: 'right' });
      doc.text('Kyriq · Check reconciliation for QuickBooks Online · Confidential to your firm', 36, H - 20);
    },
  });

  const filename = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const base64 = doc.output('datauristring').split(',')[1] ?? '';
  return { blob, base64, filename };
}
