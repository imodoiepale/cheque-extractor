/**
 * QBO/OFX File Parser
 *
 * Parses .qbo, .ofx, and .qfx files (OFX/SGML format) to extract
 * bank transactions — specifically cheque-related entries.
 *
 * QBO files use SGML (not strict XML). Tags look like:
 *   <STMTTRN>
 *     <TRNTYPE>CHECK
 *     <DTPOSTED>20240215120000
 *     <TRNAMT>-5000.00
 *     <FITID>202402150001
 *     <CHECKNUM>1025
 *     <NAME>Smith Supplies
 *     <MEMO>Office supplies
 *   </STMTTRN>
 */

export interface QBOTransaction {
  id: string;
  trnType: string;
  date: string;          // ISO date string
  amount: string;
  checkNumber: string;
  payee: string;
  memo: string;
  fitId: string;         // Financial Institution Transaction ID
  rawDate: string;       // Original DTPOSTED value
}

export interface QBOParseResult {
  transactions: QBOTransaction[];
  allTransactions: QBOTransaction[];
  accountId: string;
  bankId: string;
  dateRange: { start: string; end: string } | null;
  fileType: string;
  errors: string[];
}

/**
 * Parse a date from OFX format (YYYYMMDD or YYYYMMDDHHMMSS) to ISO string
 */
function parseOFXDate(raw: string): string {
  if (!raw || raw.length < 8) return '';
  const year = raw.substring(0, 4);
  const month = raw.substring(4, 6);
  const day = raw.substring(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Extract a single tag value from an SGML block.
 * OFX/QBO uses SGML where closing tags are optional for leaf elements.
 * e.g. <TRNAMT>-500.00  or  <TRNAMT>-500.00</TRNAMT>
 */
function extractTag(block: string, tagName: string): string {
  // Try with closing tag first
  const closedRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const closedMatch = block.match(closedRegex);
  if (closedMatch) return closedMatch[1].trim();

  // SGML style — value runs until next tag or end of block
  const openRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
  const openMatch = block.match(openRegex);
  if (openMatch) return openMatch[1].trim();

  return '';
}

/**
 * Extract all transaction blocks from the OFX content
 */
function extractTransactionBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>))/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1]);
  }

  // Handle case where last STMTTRN has no closing tag
  if (blocks.length === 0) {
    const fallbackRegex = /<STMTTRN>([\s\S]*?)(?=<\/BANKTRANLIST>|<\/STMTRS>|$)/gi;
    while ((match = fallbackRegex.exec(content)) !== null) {
      // Split on STMTTRN boundaries within the match
      const inner = match[1];
      const parts = inner.split(/<STMTTRN>/i);
      parts.forEach(p => {
        if (p.trim()) blocks.push(p);
      });
    }
  }

  return blocks;
}

/**
 * Parse a single transaction block into a QBOTransaction
 */
function parseTransaction(block: string, index: number): QBOTransaction {
  const trnType = extractTag(block, 'TRNTYPE');
  const rawDate = extractTag(block, 'DTPOSTED');
  const amount = extractTag(block, 'TRNAMT');
  const fitId = extractTag(block, 'FITID');
  const checkNum = extractTag(block, 'CHECKNUM');
  const name = extractTag(block, 'NAME');
  const memo = extractTag(block, 'MEMO');
  const payee = extractTag(block, 'PAYEE');

  return {
    id: fitId ? `qbo-file-${fitId}` : `qbo-file-${index}`,
    trnType: trnType.toUpperCase(),
    date: parseOFXDate(rawDate),
    amount,
    checkNumber: checkNum,
    payee: name || payee || '',
    memo,
    fitId,
    rawDate,
  };
}

/**
 * Main parser: takes raw file content and returns parsed result
 */
export function parseQBOFile(content: string): QBOParseResult {
  const errors: string[] = [];

  // Detect file type from header
  let fileType = 'OFX';
  if (content.includes('OFXHEADER')) {
    fileType = 'QBO/OFX (SGML)';
  } else if (content.includes('<?OFX') || content.includes('<?xml')) {
    fileType = 'OFX (XML)';
  }

  // Extract account info
  const accountId = extractTag(content, 'ACCTID');
  const bankId = extractTag(content, 'BANKID');

  // Extract all transaction blocks
  const blocks = extractTransactionBlocks(content);

  if (blocks.length === 0) {
    errors.push('No transactions found in file. Ensure the file contains <STMTTRN> blocks.');
  }

  // Parse all transactions
  const allTransactions = blocks.map((block, i) => parseTransaction(block, i));

  // Filter for cheque-related transactions
  // Include: CHECK, DEBIT with check number, any transaction with a check number
  const transactions = allTransactions.filter(txn => {
    if (txn.trnType === 'CHECK') return true;
    if (txn.checkNumber) return true;
    return false;
  });

  // Calculate date range
  let dateRange: { start: string; end: string } | null = null;
  const dates = allTransactions
    .map(t => t.date)
    .filter(d => d)
    .sort();
  if (dates.length > 0) {
    dateRange = { start: dates[0], end: dates[dates.length - 1] };
  }

  return {
    transactions,
    allTransactions,
    accountId,
    bankId,
    dateRange,
    fileType,
    errors,
  };
}

/**
 * Convert parsed QBO transactions to the format used by qb_entries table
 */
export function toQBEntries(transactions: QBOTransaction[]) {
  return transactions.map(txn => ({
    id: txn.id,
    qb_type: 'FileImport',
    qb_source: 'qbo_file_upload',
    check_number: txn.checkNumber,
    date: txn.date,
    amount: txn.amount.replace('-', ''),  // Store as positive
    payee: txn.payee,
    account: '',
    memo: txn.memo,
    raw_data: txn,
    synced_at: new Date().toISOString(),
  }));
}
