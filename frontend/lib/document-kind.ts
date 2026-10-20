/**
 * Work out what each uploaded file actually is, so a batch sorts itself.
 *
 * THE PROBLEM: upload thirty files and you got one flat list of
 * "12 pages, 47 cheques found" rows, then a preview of whichever one happened
 * to be first. Nothing told you which were bank statements and which were
 * sheets of cheque images, and the two or three that found NO cheques — the
 * only ones that actually need a human — sat in the middle of the list looking
 * exactly like the rest.
 *
 * THE SIGNAL IS ALREADY THERE. Detection has already run by the time this is
 * called, so every file carries its page count and how many cheques landed on
 * each page. That is enough to tell the shapes apart, and it costs nothing:
 * no second pass, no extra request, no model.
 *
 *   a sheet of cheque images   every page is cheques, several per page
 *   a bank statement           many pages, cheques on a minority of them
 *                              (the cheque-image pages), the rest transactions
 *   a single cheque            one page, one or two cheques
 *   nothing found              zero cheques — the case worth surfacing
 *
 * Measured against the real client files: a 30-page statement yielded 223
 * cheques with none on its transaction pages, and the contact sheets ran about
 * twenty per page across every page. The thresholds below sit between those.
 *
 * EVERY RESULT IS A GUESS, and is labelled as one. The caller shows the reason
 * and lets the user move a file to another group, because the cost of being
 * wrong is silently extracting the wrong thing from someone's bank statement.
 */

export type DocumentKind = 'cheque-sheet' | 'bank-statement' | 'single-cheque' | 'no-cheques';

/** What one page is, from backend/page_kinds.py (text layer first, AI for the rest). */
export type PageKind = 'statement' | 'cheque-images' | 'both' | 'other';

export interface DocumentSignals {
  totalPages: number;
  totalCheques: number;
  /** Cheques found on each page, in page order. */
  chequesPerPage: number[];
  /** Per-page kinds when the backend produced them; a transaction page settles it. */
  pageKinds?: PageKind[] | null;
}

/**
 * "Statement + 227 cheque images" — the one line Overview and the process page
 * show. Mirrors summarize() in backend/page_kinds.py.
 */
export function summarizeKinds(pageKinds: PageKind[] | null | undefined, totalCheques: number): string | null {
  if (!pageKinds || pageKinds.length === 0) return null;
  const kinds = new Set(pageKinds);
  const hasStatement = kinds.has('statement') || kinds.has('both');
  const hasImages = kinds.has('cheque-images') || kinds.has('both') || totalCheques > 0;
  const images = `${totalCheques} cheque image${totalCheques === 1 ? '' : 's'}`;
  if (hasStatement && hasImages) return `Statement + ${images}`;
  if (hasStatement) return 'Statement only';
  if (hasImages) return images;
  return 'No statement or cheques found';
}

export interface DocumentVerdict {
  kind: DocumentKind;
  /** Rough confidence, for ordering within a group — never shown as a percentage. */
  confidence: 'high' | 'medium' | 'low';
  /** Plain-language why, shown to the user next to the file. */
  reason: string;
}

export const KIND_LABEL: Record<DocumentKind, string> = {
  'cheque-sheet': 'Cheque images',
  'bank-statement': 'Bank statement',
  'single-cheque': 'Single cheque',
  'no-cheques': 'Needs attention',
};

export const KIND_ORDER: DocumentKind[] = [
  'no-cheques',      // first: these are the ones a person has to look at
  'bank-statement',
  'cheque-sheet',
  'single-cheque',
];

/** A page counts as a cheque page if anything was detected on it at all. */
const PAGE_HAS_CHEQUES = 1;

/** At or above this share of pages carrying cheques, it is a sheet, not a statement. */
const SHEET_COVERAGE = 0.8;

/** Sheets stack several cheques per page; a statement's cheque page may hold one or two. */
const SHEET_DENSITY = 2;

/** Below this many pages, "most pages have cheques" says nothing useful. */
const STATEMENT_MIN_PAGES = 4;

export function classifyDocument(s: DocumentSignals): DocumentVerdict {
  const pages = Math.max(0, s.totalPages || 0);
  const cheques = Math.max(0, s.totalCheques || 0);
  const perPage = s.chequesPerPage ?? [];

  // A transaction page anywhere settles it, even with no cheque images at all.
  if (s.pageKinds?.some((k) => k === 'statement' || k === 'both')) {
    const summary = summarizeKinds(s.pageKinds, cheques);
    return {
      kind: 'bank-statement',
      confidence: 'high',
      reason: summary ?? 'Transaction pages found',
    };
  }

  if (cheques === 0) {
    return {
      kind: 'no-cheques',
      confidence: 'high',
      reason: pages > 0
        ? `No cheques detected across ${pages} page${pages === 1 ? '' : 's'}`
        : 'No pages could be read',
    };
  }

  if (pages === 1 && cheques <= 2) {
    return {
      kind: 'single-cheque',
      confidence: 'high',
      reason: cheques === 1 ? 'One cheque on one page' : `${cheques} cheques on one page`,
    };
  }

  // Prefer the per-page array; fall back to the totals when it is absent, which
  // is the case for a result that predates per-page counts.
  const counted = perPage.length ? perPage.length : pages;
  const withCheques = perPage.length
    ? perPage.filter((n) => n >= PAGE_HAS_CHEQUES).length
    : pages;

  const coverage = counted > 0 ? withCheques / counted : 0;
  const density = withCheques > 0 ? cheques / withCheques : 0;

  if (coverage >= SHEET_COVERAGE && density >= SHEET_DENSITY) {
    return {
      kind: 'cheque-sheet',
      confidence: coverage === 1 ? 'high' : 'medium',
      reason: `${cheques} cheques across ${withCheques} of ${counted} pages`,
    };
  }

  if (pages >= STATEMENT_MIN_PAGES && coverage < SHEET_COVERAGE) {
    return {
      kind: 'bank-statement',
      confidence: coverage <= 0.5 ? 'high' : 'medium',
      reason: `${cheques} cheques on ${withCheques} of ${counted} pages — the rest look like transactions`,
    };
  }

  // Few pages, cheques on most of them, but not stacked. Could be either; say so
  // rather than pick, and put it with the sheets where extraction behaves the
  // same way.
  return {
    kind: 'cheque-sheet',
    confidence: 'low',
    reason: `${cheques} cheques across ${withCheques} of ${counted} pages — check this one`,
  };
}

/** Group an analysed batch by kind, in the order a person should deal with them. */
export function groupByKind<T>(
  items: T[],
  signalsOf: (item: T) => DocumentSignals | null
): { kind: DocumentKind; items: { item: T; verdict: DocumentVerdict }[] }[] {
  const buckets = new Map<DocumentKind, { item: T; verdict: DocumentVerdict }[]>();

  for (const item of items) {
    const signals = signalsOf(item);
    if (!signals) continue;                   // still analysing; not yet classifiable
    const verdict = classifyDocument(signals);
    const list = buckets.get(verdict.kind) ?? [];
    list.push({ item, verdict });
    buckets.set(verdict.kind, list);
  }

  return KIND_ORDER
    .filter((k) => buckets.has(k))
    .map((kind) => ({ kind, items: buckets.get(kind)! }));
}
