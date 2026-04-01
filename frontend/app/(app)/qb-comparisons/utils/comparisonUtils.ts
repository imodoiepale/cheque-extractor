export interface CheckExtraction {
  check_id: string;
  job_id: string;
  pdf_name: string;
  page: number;
  checkNumber?: string;
  extraction?: {
    checkNumber?: string | { value: string };
    checkDate?: string | { value: string };
    amount?: string | { value: string };
    payee?: string | { value: string };
    bankName?: string | { value: string };
    memo?: string | { value: string };
  };
  image_file?: string;
  image_url?: string;
  storage_url?: string;
}

export interface QuickBooksEntry {
  id: string;
  checkNumber: string;
  date: string;
  amount: string;
  payee: string;
  account: string;
  memo: string;
  source: 'quickbooks';
  qbSource?: string;
}

export interface ComparisonRow {
  id: string;
  checkNumber: string;
  date: string;
  amount: string;
  payee: string;
  bankAccount: string;
  memo: string;
  source: 'extraction' | 'quickbooks' | 'matched';
  matchStatus: 'matched' | 'missing-in-qb' | 'missing-in-extraction' | 'mismatch';
  extractionData?: CheckExtraction;
  qbData?: QuickBooksEntry;
  confidence?: number;
  discrepancies?: string[];
  issues?: string[];
  hasIssue?: boolean;
  isDuplicate?: boolean;
  vouched?: boolean;
  vouchedBy?: string;
  vouchedAt?: string;
}

export type SortField = 'checkNumber' | 'date' | 'amount' | 'payee' | 'matchStatus';
export type SortDirection = 'asc' | 'desc';

export function extVal(ext: any, field: string): string {
  if (!ext) return '';
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.value || '';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  return '';
}

export function parseAmount(amt: string): number {
  const cleaned = amt.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

export function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseAmount(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export type DateFormat = 'MMM D, YYYY' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string; example: string }[] = [
  { value: 'MMM D, YYYY', label: 'Jan 15, 2026', example: 'Jan 15, 2026' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '01/15/2026' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '15/01/2026' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-01-15' },
  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY', example: '15-Jan-2026' },
];

/**
 * Parse any date string into { year, month, day } integers (UTC-safe).
 */
function parseDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const s = dateStr.trim();

  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return { y: parseInt(ymd[1]), m: parseInt(ymd[2]), d: parseInt(ymd[3]) };

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return { y: parseInt(mdy[3]), m: parseInt(mdy[1]), d: parseInt(mdy[2]) };

  const dmy = s.match(/^(\d{2})[\-\/](\d{2})[\-\/](\d{4})$/);
  if (dmy) {
    const a = parseInt(dmy[1]), b = parseInt(dmy[2]);
    if (a > 12) return { y: parseInt(dmy[3]), m: b, d: a };
    return { y: parseInt(dmy[3]), m: a, d: b };
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    // Local calendar day — UTC getters shift "Feb 2, 2026" style strings vs ISO YYYY-MM-DD
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  return null;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LOOKUP: Record<string, number> = Object.fromEntries(
  SHORT_MONTHS.map((m, i) => [m.toLowerCase(), i + 1])
);

export function formatDate(dateStr: string, fmt: DateFormat = 'MMM D, YYYY'): string {
  if (!dateStr) return '';
  try {
    const parts = parseDateParts(dateStr);
    if (!parts) return dateStr;
    const { y, m, d } = parts;
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');

    switch (fmt) {
      case 'MM/DD/YYYY':
        return `${mm}/${dd}/${y}`;
      case 'DD/MM/YYYY':
        return `${dd}/${mm}/${y}`;
      case 'YYYY-MM-DD':
        return `${y}-${mm}-${dd}`;
      case 'DD-MMM-YYYY':
        return `${dd}-${SHORT_MONTHS[m - 1]}-${y}`;
      case 'MMM D, YYYY':
      default:
        return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
    }
  } catch {
    return dateStr;
  }
}

/**
 * Normalize a check number for comparison: strip non-digits and leading zeros.
 */
export function normalizeCheckNum(val: string | null | undefined): string | null {
  if (!val) return null;
  return String(val).trim().replace(/\D/g, '').replace(/^0+/, '') || null;
}

export function calculateMatchConfidence(ext: CheckExtraction, qb: QuickBooksEntry): number {
  let score = 0;
  const extraction = ext.extraction || {};
  
  const extCheckNum = normalizeCheckNum(extVal(extraction, 'checkNumber'));
  const qbCheckNum = normalizeCheckNum(qb.checkNumber);
  if (extCheckNum && qbCheckNum && extCheckNum === qbCheckNum) score += 40;
  
  const extAmount = parseAmount(extVal(extraction, 'amount'));
  const qbAmount = parseAmount(qb.amount);
  if (Math.abs(extAmount - qbAmount) < 0.01) score += 30;
  
  const extPayee = normalizeString(extVal(extraction, 'payee'));
  const qbPayee = normalizeString(qb.payee);
  if (extPayee && qbPayee && extPayee.includes(qbPayee.substring(0, 5))) score += 20;
  
  // Normalize dates before comparing to avoid format mismatch ("2026-02-02" vs "Feb 2, 2026")
  const extDateNorm = toYMD(extVal(extraction, 'checkDate') || '');
  const qbDateNorm = toYMD(qb.date || '');
  if (extDateNorm && qbDateNorm && extDateNorm === qbDateNorm) score += 10;
  
  return score;
}

export function intelligentMatch(extractions: CheckExtraction[], qbEntries: QuickBooksEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const matchedQbIds = new Set<string>();
  // Use composite key (job_id + check_id) for dedup, not just check_id
  const matchedExtCompositeIds = new Set<string>();
  const seenExtCompositeIds = new Set<string>();

  // Phase 1: Match extractions with QB entries by check number
  extractions.forEach(ext => {
    const compositeId = `${ext.job_id}-${ext.check_id}`;
    if (seenExtCompositeIds.has(compositeId)) return;
    seenExtCompositeIds.add(compositeId);
    
    const extCheckNumRaw = extVal(ext.extraction, 'checkNumber');
    const extCheckNum = normalizeCheckNum(extCheckNumRaw) || extCheckNumRaw;
    
    if (extCheckNum) {
      const qbMatch = qbEntries.find(qb =>
        (normalizeCheckNum(qb.checkNumber) || qb.checkNumber) === extCheckNum &&
        !matchedQbIds.has(qb.id)
      );
      if (qbMatch) {
        const confidence = calculateMatchConfidence(ext, qbMatch);
        const discrepancies: string[] = [];
        
        const extAmount = parseAmount(extVal(ext.extraction, 'amount'));
        const qbAmount = parseAmount(qbMatch.amount);
        if (Math.abs(extAmount - qbAmount) > 0.01) {
          discrepancies.push(`Amount: $${extAmount.toFixed(2)} vs $${qbAmount.toFixed(2)}`);
        }
        
        // Normalize dates to YYYY-MM-DD before comparing to avoid format mismatch
        const extDateNorm = toYMD(extVal(ext.extraction, 'checkDate') || '');
        const qbDateNorm = toYMD(qbMatch.date || '');
        if (extDateNorm && qbDateNorm && extDateNorm !== qbDateNorm) {
          const extDateDisplay = formatDate(extDateNorm, 'MMM D, YYYY');
          const qbDateDisplay = formatDate(qbDateNorm, 'MMM D, YYYY');
          discrepancies.push(`Date: ${extDateDisplay} vs ${qbDateDisplay}`);
        }
        
        const extPayee = normalizeString(extVal(ext.extraction, 'payee'));
        const qbPayee = normalizeString(qbMatch.payee);
        if (extPayee && qbPayee && !extPayee.includes(qbPayee.substring(0, 5)) && !qbPayee.includes(extPayee.substring(0, 5))) {
          discrepancies.push(`Payee: ${extVal(ext.extraction, 'payee')} vs ${qbMatch.payee}`);
        }
        
        rows.push({
          id: `matched-${compositeId}`,
          checkNumber: extCheckNum,
          date: extVal(ext.extraction, 'checkDate') || qbMatch.date,
          amount: extVal(ext.extraction, 'amount') || qbMatch.amount,
          payee: extVal(ext.extraction, 'payee') || qbMatch.payee,
          bankAccount: extVal(ext.extraction, 'bankName') || qbMatch.account,
          memo: extVal(ext.extraction, 'memo') || qbMatch.memo,
          source: 'matched',
          matchStatus: discrepancies.length > 0 ? 'mismatch' : 'matched',
          extractionData: ext,
          qbData: qbMatch,
          confidence,
          discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
        });
        
        matchedQbIds.add(qbMatch.id);
        matchedExtCompositeIds.add(compositeId);
        return;
      }
    }
  });

  // Phase 2: Add unmatched extractions — use composite key so checks from different docs aren't skipped
  extractions.forEach(ext => {
    const compositeId = `${ext.job_id}-${ext.check_id}`;
    if (seenExtCompositeIds.has(compositeId) && matchedExtCompositeIds.has(compositeId)) return;
    // Mark as seen if not yet
    if (!seenExtCompositeIds.has(compositeId)) {
      seenExtCompositeIds.add(compositeId);
    } else if (matchedExtCompositeIds.has(compositeId)) {
      return; // Already matched
    }
    // Check if this compositeId was already added as unmatched
    if (rows.some(r => r.id === `ext-${compositeId}`)) return;
    
    rows.push({
      id: `ext-${compositeId}`,
      checkNumber: extVal(ext.extraction, 'checkNumber') || ext.check_id,
      date: extVal(ext.extraction, 'checkDate'),
      amount: extVal(ext.extraction, 'amount'),
      payee: extVal(ext.extraction, 'payee'),
      bankAccount: extVal(ext.extraction, 'bankName'),
      memo: extVal(ext.extraction, 'memo'),
      source: 'extraction',
      matchStatus: 'missing-in-qb',
      extractionData: ext,
    });
  });

  // Phase 3: Unmatched QB entries
  qbEntries.forEach(qb => {
    if (matchedQbIds.has(qb.id)) return;
    
    rows.push({
      id: `qb-${qb.id}`,
      checkNumber: qb.checkNumber,
      date: qb.date,
      amount: qb.amount,
      payee: qb.payee,
      bankAccount: qb.account,
      memo: qb.memo,
      source: 'quickbooks',
      matchStatus: 'missing-in-extraction',
      qbData: qb,
    });
  });

  // Phase 4: Detect duplicates and assign issues to every row
  detectIssues(rows);

  return rows;
}

/**
 * Post-process rows to detect duplicates, missing data, and other issues.
 * Mutates the rows in-place for performance.
 */
export function detectIssues(rows: ComparisonRow[]): void {
  // Build canonical check-number frequency map.
  // Canonical = digits only, leading zeros stripped (so "01042" == "1042").
  // Track canonical -> count and canonical -> display string (first seen).
  const canonicalCounts: Record<string, number> = {};
  const canonicalDisplay: Record<string, string> = {};
  rows.forEach(row => {
    const canonical = normalizeCheckNum(row.checkNumber);
    if (canonical) {
      canonicalCounts[canonical] = (canonicalCounts[canonical] || 0) + 1;
      if (!canonicalDisplay[canonical]) canonicalDisplay[canonical] = row.checkNumber?.trim() || canonical;
    }
  });

  // Build amount+date+payee signature map for detecting duplicates when check#
  // is missing or inconsistent (same amount on same date to same payee).
  const txnSigCounts: Record<string, number> = {};
  rows.forEach(row => {
    const sigDate = toYMD(row.date || '') || '';
    const sigAmt = parseAmount(row.amount).toFixed(2);
    const sigPayee = normalizeString(row.payee || '').slice(0, 20);
    if (sigDate && sigAmt !== '0.00' && sigPayee) {
      const sig = `${sigDate}|${sigAmt}|${sigPayee}`;
      txnSigCounts[sig] = (txnSigCounts[sig] || 0) + 1;
    }
  });

  rows.forEach(row => {
    const issues: string[] = [];
    const canonical = normalizeCheckNum(row.checkNumber);
    const displayNum = row.checkNumber?.trim();

    // Duplicate check number (by canonical form)
    if (canonical && canonicalCounts[canonical] > 1) {
      issues.push(`Duplicate check #${canonicalDisplay[canonical]} (${canonicalCounts[canonical]} occurrences)`);
      row.isDuplicate = true;
    }

    // Fallback duplicate: same amount+date+payee when no check number
    if (!canonical) {
      const sigDate = toYMD(row.date || '') || '';
      const sigAmt = parseAmount(row.amount).toFixed(2);
      const sigPayee = normalizeString(row.payee || '').slice(0, 20);
      if (sigDate && sigAmt !== '0.00' && sigPayee) {
        const sig = `${sigDate}|${sigAmt}|${sigPayee}`;
        if (txnSigCounts[sig] > 1) {
          issues.push(`Possible duplicate transaction — same amount, date & payee (${txnSigCounts[sig]} occurrences)`);
          row.isDuplicate = true;
        }
      }
    }

    // Discrepancies from matching
    if (row.discrepancies && row.discrepancies.length > 0) {
      issues.push(...row.discrepancies);
    }

    // Missing in QB
    if (row.matchStatus === 'missing-in-qb') {
      issues.push('Not found in QuickBooks');
    }

    // Missing in extraction
    if (row.matchStatus === 'missing-in-extraction') {
      issues.push('Not found in check extractions');
    }

    // Missing critical data
    if (!displayNum) {
      issues.push('Missing check number');
    }
    if (!row.amount || parseAmount(row.amount) === 0) {
      issues.push('Missing or zero amount');
    }

    row.issues = issues.length > 0 ? issues : undefined;
    row.hasIssue = issues.length > 0;
  });
}

/**
 * Normalize any date string to YYYY-MM-DD for safe comparison.
 * All formats handled via regex — no Date object, no timezone risk.
 */
function toYMD(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY-M-D (ISO, with or without time part)
  const isoFull = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T .Z]|$)/);
  if (isoFull) return `${isoFull[1]}-${isoFull[2].padStart(2, '0')}-${isoFull[3].padStart(2, '0')}`;

  // MM/DD/YYYY or M/D/YYYY  (US / QB format)
  // If first part > 12 it is unambiguously DD/MM/YYYY — swap.
  const slashNum = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashNum) {
    const a = parseInt(slashNum[1], 10), b = parseInt(slashNum[2], 10);
    const yyyy = slashNum[3];
    if (a > 12) return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    return `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }

  // MM-DD-YYYY or DD-MM-YYYY (dash numeric)
  const dashNum = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashNum) {
    const a = parseInt(dashNum[1], 10), b = parseInt(dashNum[2], 10);
    const yyyy = dashNum[3];
    if (a > 12) return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    return `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }

  // MMM D, YYYY  or  MMM DD YYYY  (e.g. "Mar 23, 2026" / "March 23 2026")
  const mmmDY = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mmmDY) {
    const mi = MONTH_LOOKUP[mmmDY[1].toLowerCase().slice(0, 3)];
    if (mi) return `${mmmDY[3]}-${String(mi).padStart(2, '0')}-${mmmDY[2].padStart(2, '0')}`;
  }

  // D MMM YYYY  or  DD MMM YYYY  (e.g. "23 Mar 2026")
  const dMmmY = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (dMmmY) {
    const mi = MONTH_LOOKUP[dMmmY[2].toLowerCase().slice(0, 3)];
    if (mi) return `${dMmmY[3]}-${String(mi).padStart(2, '0')}-${dMmmY[1].padStart(2, '0')}`;
  }

  // DD-MMM-YYYY  (e.g. "23-Mar-2026")
  const dDashMmm = s.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/);
  if (dDashMmm) {
    const mi = MONTH_LOOKUP[dDashMmm[2].toLowerCase().slice(0, 3)];
    if (mi) return `${dDashMmm[3]}-${String(mi).padStart(2, '0')}-${dDashMmm[1].padStart(2, '0')}`;
  }

  return null;
}

/** True when two date strings refer to the same calendar day (ignores format). */
export function areDatesSameCalendarDay(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ya = toYMD(String(a || '').trim());
  const yb = toYMD(String(b || '').trim());
  if (ya && yb) return ya === yb;
  return String(a || '').trim() === String(b || '').trim();
}

export function filterByDateRange(
  rows: ComparisonRow[],
  startDate: string | null,
  endDate: string | null
): ComparisonRow[] {
  if (!startDate && !endDate) return rows;

  const startYMD = startDate ? toYMD(startDate) : null;
  const endYMD = endDate ? toYMD(endDate) : null;

  return rows.filter(row => {
    // Use QB date if available, fallback to row date
    const raw = row.qbData?.date || row.date;
    if (!raw) return true; // keep rows with no date (don't hide data)

    const rowYMD = toYMD(raw);
    if (!rowYMD) return true; // unparseable — keep it visible

    if (startYMD && rowYMD < startYMD) return false;
    if (endYMD && rowYMD > endYMD) return false;
    return true;
  });
}

export function filterByQBSource(
  rows: ComparisonRow[],
  qbSource: string | null
): ComparisonRow[] {
  if (!qbSource || qbSource === 'all') return rows;
  
  return rows.filter(row => {
    if (row.source === 'extraction') return true;
    return row.qbData?.qbSource === qbSource;
  });
}

export function sortRows(
  rows: ComparisonRow[],
  sortField: SortField,
  sortDirection: SortDirection
): ComparisonRow[] {
  return [...rows].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    
    if (sortField === 'amount') {
      aVal = parseAmount(aVal);
      bVal = parseAmount(bVal);
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}
