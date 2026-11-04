/**
 * Runnable check: npx tsx lib/comparison-rows.check.ts
 * A numberless deposit is not a missing cheque; a numberless cheque still is.
 */
import assert from 'node:assert';
import { intelligentMatch } from '../app/(app)/qb-comparisons/utils/comparisonUtils';

const entry = (id: string, qb_type: string, checkNumber: string) => ({
  id, qb_type, checkNumber, date: '2026-05-31', amount: '100', payee: '', account: 'Developer', memo: '',
  source: 'quickbooks', qbSource: 'cheque_received', intuit_id: id,
});

const rows = intelligentMatch([], [
  entry('opening', 'Deposit', ''),
  entry('numbered', 'Deposit', '1001'),
  entry('nonumber', 'Purchase', ''),
] as any);

assert.deepStrictEqual(rows.map((r) => r.id).sort(), ['qb-nonumber', 'qb-numbered']);
console.log('comparison-rows check passed');
