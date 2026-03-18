/**
 * Matching Algorithm — TypeScript port
 * Scores OCR-extracted checks against QB transactions.
 *
 * Scoring breakdown (max 100):
 *   Amount:       40 pts
 *   Check number: 30 pts
 *   Date:         15 pts
 *   Payee:        15 pts
 */

import { createClient } from '@supabase/supabase-js';

// ── Levenshtein distance for fuzzy payee matching ────────────
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Similarity score 0-100 between two strings ───────────────
export function stringSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 100;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(s1, s2);
  return Math.round((1 - dist / maxLen) * 100);
}

// ── Normalize a check number (strip leading zeros, spaces) ───
function normalizeCheckNum(val: string | null | undefined): string | null {
  if (!val) return null;
  return String(val).replace(/\D/g, '').replace(/^0+/, '') || null;
}

// ── Normalize a dollar amount ────────────────────────────────
function normalizeAmount(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return parseFloat(String(val).replace(/[^0-9.-]/g, ''));
}

// ── Date difference in days ──────────────────────────────────
function dateDiffDays(d1: string | null, d2: string | null): number {
  if (!d1 || !d2) return 999;
  const ms = Math.abs(new Date(d1).getTime() - new Date(d2).getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ── Types ────────────────────────────────────────────────────
export interface MatchReasons {
  amount: number;
  checkNumber: number;
  date: number;
  payee: number;
}

export interface MatchFlag {
  type: string;
  message: string;
  diff?: number;
}

export interface ScoreResult {
  score: number;
  reasons: MatchReasons;
  flags: MatchFlag[];
  amtDiff: number;
}

export type MatchStatus =
  | 'pending'
  | 'matched'
  | 'approved'
  | 'flagged'
  | 'discrepancy'
  | 'unmatched'
  | 'rejected';

// ── Score one check against one QB transaction ───────────────
export function scoreMatch(
  check: { amount?: number | string | null; check_number?: string | null; check_date?: string | null; payee?: string | null },
  qbTxn: { amount?: number | string | null; doc_number?: string | null; txn_date?: string | null; payee?: string | null }
): ScoreResult {
  const reasons: MatchReasons = { amount: 0, checkNumber: 0, date: 0, payee: 0 };
  const flags: MatchFlag[] = [];

  // ── Amount (40 pts) ────────────────────────────────────────
  const checkAmt = normalizeAmount(check.amount);
  const qbAmt = normalizeAmount(qbTxn.amount);
  const amtDiff =
    checkAmt !== null && qbAmt !== null ? Math.abs(checkAmt - qbAmt) : null;

  if (amtDiff === null) reasons.amount = 0;
  else if (amtDiff === 0) reasons.amount = 40;
  else if (amtDiff <= 0.01) reasons.amount = 38;
  else if (amtDiff <= 1.0) reasons.amount = 25;
  else if (amtDiff <= 10.0) reasons.amount = 15;
  else if (amtDiff <= 50.0) reasons.amount = 5;
  else reasons.amount = 0;

  if (amtDiff !== null && amtDiff > 0.01) {
    flags.push({
      type: 'amount',
      message: `Amount differs by $${amtDiff.toFixed(2)}`,
      diff: amtDiff,
    });
  }

  // ── Check number (30 pts) ──────────────────────────────────
  const checkNum = normalizeCheckNum(check.check_number);
  const qbNum = normalizeCheckNum(qbTxn.doc_number);

  if (checkNum && qbNum) {
    if (checkNum === qbNum) reasons.checkNumber = 30;
    else if (checkNum.endsWith(qbNum) || qbNum.endsWith(checkNum))
      reasons.checkNumber = 10;
    else reasons.checkNumber = 0;
  } else {
    reasons.checkNumber = 0;
  }

  // ── Date (15 pts) ──────────────────────────────────────────
  const daysDiff = dateDiffDays(check.check_date ?? null, qbTxn.txn_date ?? null);
  if (daysDiff === 0) reasons.date = 15;
  else if (daysDiff <= 1) reasons.date = 12;
  else if (daysDiff <= 3) reasons.date = 8;
  else if (daysDiff <= 7) reasons.date = 4;
  else if (daysDiff <= 14) reasons.date = 1;
  else reasons.date = 0;

  // ── Payee (15 pts) ─────────────────────────────────────────
  const payeeSim = stringSimilarity(check.payee ?? null, qbTxn.payee ?? null);
  if (payeeSim === 100) reasons.payee = 15;
  else if (payeeSim >= 85) reasons.payee = 12;
  else if (payeeSim >= 70) reasons.payee = 8;
  else if (payeeSim >= 50) reasons.payee = 4;
  else reasons.payee = 0;

  const total = reasons.amount + reasons.checkNumber + reasons.date + reasons.payee;

  return {
    score: Math.min(total, 100),
    reasons,
    flags,
    amtDiff: amtDiff || 0,
  };
}

// ── Determine status from confidence score ───────────────────
export function statusFromScore(score: number, flags: MatchFlag[]): MatchStatus {
  const hasAmountMismatch = flags.some(
    (f) => f.type === 'amount' && (f.diff ?? 0) > 0.01
  );
  if (score === 0) return 'unmatched';
  if (hasAmountMismatch && score >= 60) return 'discrepancy';
  if (score >= 95) return 'matched';
  if (score >= 70) return 'pending';
  return 'pending';
}

// ── Main: run matching for all checks in a QB company ────────
export async function runMatching(
  tenantId: string,
  userId: string,
  realmId: string
): Promise<{ matched: number; unmatched: number; total: number }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  );

  console.log(`[Matching] Starting for tenant ${tenantId}, realm ${realmId}`);

  // Fetch unmatched/pending checks for this realm
  const { data: checks, error: checksErr } = await supabase
    .from('checks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('realm_id', realmId)
    .in('status', ['pending_review', 'pending', 'unmatched']);

  if (checksErr) throw checksErr;
  if (!checks?.length) return { matched: 0, unmatched: 0, total: 0 };

  // Fetch all QB transactions for this company (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: qbTxns, error: txnsErr } = await supabase
    .from('qb_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('realm_id', realmId)
    .gte('txn_date', ninetyDaysAgo.toISOString().split('T')[0]);

  if (txnsErr) throw txnsErr;
  if (!qbTxns?.length) {
    console.log('[Matching] No QB transactions found — marking all as unmatched');
    // Create unmatched entries for all checks
    const unmatchedResults = checks.map((check) => ({
      check_id: check.id,
      tenant_id: tenantId,
      user_id: userId,
      realm_id: realmId,
      qb_txn_id: null,
      confidence_score: 0,
      confidence_reasons: { amount: 0, checkNumber: 0, date: 0, payee: 0 },
      status: 'unmatched' as const,
      discrepancy_amount: null,
      discrepancy_type: null,
    }));

    await supabase
      .from('matches')
      .upsert(unmatchedResults, { onConflict: 'check_id' });

    return { matched: 0, unmatched: checks.length, total: checks.length };
  }

  let matched = 0;
  let unmatched = 0;
  const matchResults: any[] = [];

  for (const check of checks) {
    let bestMatch: any = null;
    let bestScore = 0;
    let bestResult: ScoreResult | null = null;

    // Score this check against every QB transaction
    for (const qbTxn of qbTxns) {
      const result = scoreMatch(check, qbTxn);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = qbTxn;
        bestResult = result;
      }
    }

    const MIN_SCORE_TO_SUGGEST = 40;

    if (bestScore >= MIN_SCORE_TO_SUGGEST && bestMatch && bestResult) {
      const status = statusFromScore(bestScore, bestResult.flags);
      matchResults.push({
        check_id: check.id,
        tenant_id: tenantId,
        user_id: userId,
        realm_id: realmId,
        qb_txn_id: bestMatch.id,
        confidence_score: bestScore,
        confidence_reasons: bestResult.reasons,
        status,
        discrepancy_amount:
          bestResult.amtDiff > 0.01 ? bestResult.amtDiff : null,
        discrepancy_type: bestResult.flags[0]?.type || null,
      });
      if (status !== 'unmatched') matched++;
    } else {
      matchResults.push({
        check_id: check.id,
        tenant_id: tenantId,
        user_id: userId,
        realm_id: realmId,
        qb_txn_id: null,
        confidence_score: 0,
        confidence_reasons: { amount: 0, checkNumber: 0, date: 0, payee: 0 },
        status: 'unmatched',
        discrepancy_amount: null,
        discrepancy_type: null,
      });
      unmatched++;
    }
  }

  // Upsert all match results
  const { error: upsertErr } = await supabase
    .from('matches')
    .upsert(matchResults, { onConflict: 'check_id' });

  if (upsertErr) throw upsertErr;

  console.log(`[Matching] Done: ${matched} matched, ${unmatched} unmatched`);
  return { matched, unmatched, total: checks.length };
}
