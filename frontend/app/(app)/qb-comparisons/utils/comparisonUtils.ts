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
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  return null;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

export function calculateMatchConfidence(ext: CheckExtraction, qb: QuickBooksEntry): number {
  let score = 0;
  const extraction = ext.extraction || {};
  
  const extCheckNum = extVal(extraction, 'checkNumber');
  const qbCheckNum = qb.checkNumber;
  if (extCheckNum === qbCheckNum) score += 40;
  
  const extAmount = parseAmount(extVal(extraction, 'amount'));
  const qbAmount = parseAmount(qb.amount);
  if (Math.abs(extAmount - qbAmount) < 0.01) score += 30;
  
  const extPayee = normalizeString(extVal(extraction, 'payee'));
  const qbPayee = normalizeString(qb.payee);
  if (extPayee && qbPayee && extPayee.includes(qbPayee.substring(0, 5))) score += 20;
  
  if (extVal(extraction, 'checkDate') === qb.date) score += 10;
  
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
    
    const extCheckNum = extVal(ext.extraction, 'checkNumber');
    
    if (extCheckNum) {
      const qbMatch = qbEntries.find(qb => qb.checkNumber === extCheckNum && !matchedQbIds.has(qb.id));
      if (qbMatch) {
        const confidence = calculateMatchConfidence(ext, qbMatch);
        const discrepancies: string[] = [];
        
        const extAmount = parseAmount(extVal(ext.extraction, 'amount'));
        const qbAmount = parseAmount(qbMatch.amount);
        if (Math.abs(extAmount - qbAmount) > 0.01) {
          discrepancies.push(`Amount: $${extAmount.toFixed(2)} vs $${qbAmount.toFixed(2)}`);
        }
        
        if (extVal(ext.extraction, 'checkDate') !== qbMatch.date) {
          discrepancies.push(`Date: ${extVal(ext.extraction, 'checkDate')} vs ${qbMatch.date}`);
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
  // Build check number frequency map (only non-empty check numbers)
  const checkNumCounts: Record<string, number> = {};
  rows.forEach(row => {
    const num = row.checkNumber?.trim();
    if (num) {
      checkNumCounts[num] = (checkNumCounts[num] || 0) + 1;
    }
  });

  rows.forEach(row => {
    const issues: string[] = [];
    const num = row.checkNumber?.trim();

    // Duplicate check number
    if (num && checkNumCounts[num] > 1) {
      issues.push(`Duplicate check #${num} (${checkNumCounts[num]} occurrences)`);
      row.isDuplicate = true;
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
    if (!num) {
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
 * Avoids Date object timezone pitfalls entirely.
 */
function toYMD(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY
  const slashMDY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMDY) {
    const [, mm, dd, yyyy] = slashMDY;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dashDMY = s.match(/^(\d{2})[\-\/](\d{2})[\-\/](\d{4})$/);
  if (dashDMY) {
    const [, a, b, yyyy] = dashDMY;
    const aNum = parseInt(a, 10);
    if (aNum > 12) return `${yyyy}-${b}-${a}`;
    return `${yyyy}-${a}-${b}`;
  }

  // ISO with time
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (isoMatch) return isoMatch[1];

  // Fallback: extract UTC date parts
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  return null;
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
