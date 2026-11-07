/**
 * Runnable check: npx tsx "app/(app)/qb-comparisons/utils/comparisonUtils.check.ts"
 * Michael's July answer key: Approve all may hold only the eight ordinary
 * cheques. A duplicate, a different payee and a different amount go to review.
 */
import assert from 'node:assert';
import { intelligentMatch, isCleanMatch, payeesAgree, type CheckExtraction, type QuickBooksEntry } from './comparisonUtils';

const qbRows: [string, string, string, string][] = [
  ['974201', '2026-07-02', 'Cedar Supply', '1250.00'], ['974202', '2026-07-03', 'Oak Services', '875.50'],
  ['974203', '2026-07-06', 'Pine Electric', '2340.75'], ['974204', '2026-07-08', 'River Plumbing', '1685.00'],
  ['974205', '2026-07-10', 'Summit Repair', '920.25'], ['974206', '2026-07-13', 'Willow Design', '1475.80'],
  ['974207', '2026-07-15', 'Maple Equipment', '3260.40'], ['974208', '2026-07-17', 'Harbor Office', '645.90'],
  ['974209', '2026-07-20', 'Canyon Logistics', '2180.60'], ['974210', '2026-07-21', 'Silver Consulting', '1850.00'],
  ['974211', '2026-07-24', 'Red Oak Supplies', '1225.45'], ['974212', '2026-07-27', 'Blue Meadow', '3510.25'],
  ['974213', '2026-07-30', 'Cedar Repair', '780.00'],
];
const qb: QuickBooksEntry[] = qbRows.map(([checkNumber, date, payee, amount], i) =>
  ({ id: `q${i}`, checkNumber, date, payee, amount, account: 'Op', memo: '', source: 'quickbooks' }));

const images: [string, string, string, string][] = [
  ...qbRows.slice(0, 9), qbRows[8], qbRows[9], qbRows[9],
  ['974211', '2026-07-24', 'Red Oak Technology', '1225.45'],
  ['974212', '2026-07-27', 'Blue Meadow', '3150.25'],
  ['974913', '2026-07-30', 'Cedar Repair', '780.00'],
];
const ext: CheckExtraction[] = images.map(([checkNumber, checkDate, payee, amount], i) => ({
  check_id: `c${i}`, job_id: 'j1', pdf_name: 'july.pdf', page: 2,
  extraction: { checkNumber, checkDate, payee, amount },
}));

const rows = intelligentMatch(ext, qb);
const clean = rows.filter(isCleanMatch).map(r => r.checkNumber).sort();
assert.deepEqual(clean, ['974201', '974202', '974203', '974204', '974205', '974206', '974207', '974208'],
  `Approve all must hold the eight ordinary cheques only, got ${clean}`);
for (const n of ['974209', '974210']) {
  assert.ok(rows.filter(r => r.checkNumber === n && r.extractionData).every(r => r.isDuplicate), `${n} copies must be flagged duplicate`);
}
const row = (n: string) => rows.find(r => r.checkNumber === n && r.qbData && r.extractionData)!;
assert.equal(row('974211').matchStatus, 'mismatch', 'a different payee must be a mismatch');
assert.equal(row('974212').matchStatus, 'mismatch', 'a $360 difference must be a mismatch');

assert.ok(payeesAgree('Cedar Repair', 'Cedar Repair LLC'), 'a suffix is the same payee');
assert.ok(payeesAgree('', 'Anyone'), 'a missing payee is not a disagreement');
assert.ok(!payeesAgree('Red Oak Technology', 'Red Oak Supplies'), 'a shared first word is not the same payee');

console.log('comparisonUtils: ok');
