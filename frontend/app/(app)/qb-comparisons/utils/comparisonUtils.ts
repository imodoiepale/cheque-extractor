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

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
  const matchedExtIds = new Set<string>();

  extractions.forEach(ext => {
    const extCheckNum = extVal(ext.extraction, 'checkNumber');
    if (!extCheckNum) return;
    
    const qbMatch = qbEntries.find(qb => qb.checkNumber === extCheckNum && !matchedQbIds.has(qb.id));
    if (qbMatch) {
      const confidence = calculateMatchConfidence(ext, qbMatch);
      const discrepancies: string[] = [];
      
      const extAmount = parseAmount(extVal(ext.extraction, 'amount'));
      const qbAmount = parseAmount(qbMatch.amount);
      if (Math.abs(extAmount - qbAmount) > 0.01) {
        discrepancies.push(`Amount mismatch: $${extAmount.toFixed(2)} vs $${qbAmount.toFixed(2)}`);
      }
      
      if (extVal(ext.extraction, 'checkDate') !== qbMatch.date) {
        discrepancies.push(`Date mismatch: ${extVal(ext.extraction, 'checkDate')} vs ${qbMatch.date}`);
      }
      
      const extPayee = normalizeString(extVal(ext.extraction, 'payee'));
      const qbPayee = normalizeString(qbMatch.payee);
      if (extPayee && qbPayee && !extPayee.includes(qbPayee.substring(0, 5)) && !qbPayee.includes(extPayee.substring(0, 5))) {
        discrepancies.push(`Payee mismatch: ${extVal(ext.extraction, 'payee')} vs ${qbMatch.payee}`);
      }
      
      rows.push({
        id: `matched-${ext.check_id}`,
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
      matchedExtIds.add(ext.check_id);
    }
  });

  extractions.forEach(ext => {
    if (matchedExtIds.has(ext.check_id)) return;
    
    rows.push({
      id: `ext-${ext.check_id}`,
      checkNumber: extVal(ext.extraction, 'checkNumber'),
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

  return rows;
}

export function filterByDateRange(
  rows: ComparisonRow[],
  startDate: string | null,
  endDate: string | null
): ComparisonRow[] {
  if (!startDate && !endDate) return rows;
  
  return rows.filter(row => {
    if (!row.date) return false;
    const rowDate = new Date(row.date);
    
    if (startDate && rowDate < new Date(startDate)) return false;
    if (endDate && rowDate > new Date(endDate)) return false;
    
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
