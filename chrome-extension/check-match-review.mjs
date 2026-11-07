#!/usr/bin/env node
// `node chrome-extension/check-match-review.mjs`
// Michael's July answer key through the extension's real scoring code: only the
// eight ordinary cheques may be approvable; duplicates, a different payee and a
// different amount must go to review. Functions are lifted from the shipped files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const sw = readFileSync(new URL('background/service-worker.js', here), 'utf8');
const sp = readFileSync(new URL('sidepanel/sidepanel.js', here), 'utf8');
const lift = (src, name) => {
  const start = src.indexOf(name);
  assert.ok(start >= 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0, i = open;
  do { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; } while (depth);
  return src.slice(start, i);
};
const code = [
  sw.match(/const PAYEE_MATCH_MIN = \d+;/)[0],
  lift(sw, 'function levenshtein('), lift(sw, 'function stringSimilarity('),
  lift(sw, 'function scoreMatch('), lift(sw, 'function statusFromScore('),
  lift(sw, 'function markDuplicates('), lift(sp, 'function isCleanMatch('),
  'return { scoreMatch, statusFromScore, markDuplicates, isCleanMatch };',
].join('\n');
const { scoreMatch, statusFromScore, markDuplicates, isCleanMatch } = new Function(code)();

// QBO setup key (13 cheques) and the 15 bank images.
const qb = [
  ['974201', '2026-07-02', 'Cedar Supply', 1250.00], ['974202', '2026-07-03', 'Oak Services', 875.50],
  ['974203', '2026-07-06', 'Pine Electric', 2340.75], ['974204', '2026-07-08', 'River Plumbing', 1685.00],
  ['974205', '2026-07-10', 'Summit Repair', 920.25], ['974206', '2026-07-13', 'Willow Design', 1475.80],
  ['974207', '2026-07-15', 'Maple Equipment', 3260.40], ['974208', '2026-07-17', 'Harbor Office', 645.90],
  ['974209', '2026-07-20', 'Canyon Logistics', 2180.60], ['974210', '2026-07-21', 'Silver Consulting', 1850.00],
  ['974211', '2026-07-24', 'Red Oak Supplies', 1225.45], ['974212', '2026-07-27', 'Blue Meadow', 3510.25],
  ['974213', '2026-07-30', 'Cedar Repair', 780.00],
].map(([doc_number, txn_date, payee, amount], i) => ({ id: `q${i}`, doc_number, txn_date, payee, amount }));
const bank = [...qb.slice(0, 9), qb[8], qb[9], qb[9]].map(t => ({ check_number: t.doc_number, check_date: t.txn_date, payee: t.payee, amount: t.amount }));
bank.push({ check_number: '974211', check_date: '2026-07-24', payee: 'Red Oak Technology', amount: 1225.45 });
bank.push({ check_number: '974212', check_date: '2026-07-27', payee: 'Blue Meadow', amount: 3150.25 });
bank.push({ check_number: '974913', check_date: '2026-07-30', payee: 'Cedar Repair', amount: 780.00 });
assert.equal(bank.length, 15);

// Best-scoring QB cheque per bank cheque, as runFullMatch does.
const results = markDuplicates(bank.map(check => {
  const best = qb.map(t => ({ t, r: scoreMatch(check, t) })).sort((a, b) => b.r.score - a.r.score)[0];
  return { check, qbTxn: best.t, score: best.r.score, flags: best.r.flags, amtDiff: best.r.amtDiff,
           status: statusFromScore(best.r.score, best.r.flags) };
}));
const by = n => results.filter(r => r.check.check_number === n);

const clean = results.filter(isCleanMatch).map(r => r.check.check_number);
assert.deepEqual(clean, ['974201', '974202', '974203', '974204', '974205', '974206', '974207', '974208'],
  'Approve all must hold the eight ordinary cheques only');
for (const n of ['974209', '974210']) {
  assert.equal(by(n).length, 2);
  assert.ok(by(n).every(r => r.status === 'duplicate'), `both copies of ${n} must be duplicates`);
}
assert.equal(by('974211')[0].status, 'discrepancy', 'a different payee must be a discrepancy');
assert.equal(by('974212')[0].status, 'discrepancy', 'a $360 amount difference must be a discrepancy');
assert.equal(by('974913')[0].status, 'discrepancy', 'a different cheque number must be a discrepancy');

// A cheque a person already approved keeps its status; its twin still goes to review.
const kept = markDuplicates([
  { check: { check_number: '1', amount: 5, status: 'approved' }, status: 'approved' },
  { check: { check_number: '1', amount: 5 }, status: 'matched' },
]);
assert.deepEqual(kept.map(r => r.status), ['approved', 'duplicate']);

console.log('check-match-review: ok');
