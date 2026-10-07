/**
 * Self-check for History, Reports and upload retention (CHECKLIST section 13).
 *
 *   cd frontend && npx tsx scripts/check-history-reports.ts
 *
 * No test framework on purpose. Each assertion below guards a regression that
 * would LOOK fine on screen and be wrong in a way nobody notices:
 *
 *  1. A 503 `migration_not_applied` rendered as an empty list. "No history" is
 *     a different and much worse statement than "not deployed yet".
 *  2. Reports reachable by a non-Administrator. `reports.view` is
 *     Administrator-only; the endpoint must 403, not merely be hidden.
 *  3. Retention deleting the extracted data or the batch. Only the source PDF
 *     may ever go.
 *  4. A retention sweep that is not idempotent — a second run erroring, or a
 *     file that is already gone being recorded as a failure and retried for
 *     ever.
 *  5. A literal hex or a raw Tailwind palette class, so the surface stops
 *     tracking the token file.
 *
 * Source is matched with comments STRIPPED, because a comment naming a thing
 * is not the thing. Several assertions in this repo have passed vacuously that
 * way.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { can } from '../lib/roles';
import {
  EMPTY_TALLY,
  RETENTION_DAYS,
  isSettled,
  jobStoragePrefix,
  pdfObjectsIn,
  retentionDeleteAfter,
  sweepOutcome,
  tally,
  type StorageEntry,
} from '../lib/retention';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(path.join(repo, rel), 'utf8');

/** Comments removed: TS/JS line and block comments, and JSX comment nodes. */
const strip = (src: string) =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** SQL with -- comments removed. */
const stripSql = (src: string) => src.replace(/--[^\n]*/g, '');

const code = (rel: string) => strip(read(rel));

const HISTORY_PAGE = 'app/(app)/history/page.tsx';
const REPORTS_PAGE = 'app/(app)/reports/page.tsx';
const CLIENT = 'lib/history-client.ts';
const RETENTION = 'lib/retention.ts';
const SWEEP = 'pages/api/retention/sweep.ts';
const REPORTS_API = 'pages/api/reports/summary.ts';
const APPROVERS_API = 'pages/api/history/approvers.ts';
const PRIVACY = 'app/(public)/privacy/page.tsx';
const MIGRATION = 'supabase/migrations/035_history_reports_and_retention.sql';

const OWNED_TS = [
  HISTORY_PAGE,
  REPORTS_PAGE,
  CLIENT,
  RETENTION,
  SWEEP,
  REPORTS_API,
  APPROVERS_API,
];

const clientCode = code(CLIENT);
const historyCode = code(HISTORY_PAGE);
const reportsCode = code(REPORTS_PAGE);
const sweepCode = code(SWEEP);
const reportsApiCode = code(REPORTS_API);
const sql = stripSql(readRepo(MIGRATION));

/* ── 1. A 503 is "not deployed", never an empty list ────────────────────── */

assert.match(
  clientCode,
  /status === 503 \|\| body\?\.error === 'migration_not_applied'/,
  `${CLIENT} no longer recognises a 503 / migration_not_applied response`
);
// The list loader must hand back the failure, not a page of zero rows.
assert.match(
  clientCode,
  /if \(status !== 200 \|\| !Array\.isArray\(body\?\.batches\)\) return toFailure\(status, body\)/,
  `${CLIENT} loadHistory no longer returns a failure for a non-200 — a 503 would read as "no history"`
);
assert.doesNotMatch(
  clientCode,
  /batches:\s*\[\s*\]/,
  `${CLIENT} fabricates an empty batches array — a 503 must never render as "no history"`
);
assert.doesNotMatch(
  clientCode,
  /kind:\s*'page'[\s\S]{0,200}catch/,
  `${CLIENT} returns a success page from a catch block`
);
// And the page must render the failure instead of the table.
assert.match(
  historyCode,
  /failure\.kind === 'migration_not_applied'/,
  `${HISTORY_PAGE} no longer distinguishes "not deployed" from "no history"`
);
assert.match(
  historyCode,
  /\{!failure \? \(\s*<TableShell>/,
  `${HISTORY_PAGE} renders the table even when the endpoint failed — an error would look like an empty firm`
);
assert.match(
  reportsCode,
  /failure\.kind === 'migration_not_applied'/,
  `${REPORTS_PAGE} no longer reports an unapplied migration honestly`
);
// History reads the committed endpoint; it must not grow a second list route.
assert.match(
  clientCode,
  /\/api\/batches\?/,
  `${CLIENT} no longer reads GET /api/batches — History must use the committed list endpoint`
);
assert.doesNotMatch(
  historyCode,
  /\/api\/history\/batches|\/api\/batches\/list/,
  `${HISTORY_PAGE} points at a second batches list endpoint`
);
// An abandoned run is history too: the default filter is "all" and there is an
// Abandoned tab.
assert.match(
  clientCode,
  /q\.set\('status', params\.status \|\| 'all'\)/,
  `${CLIENT} no longer defaults History to every status — abandoned runs would be hidden`
);
assert.ok(
  historyCode.includes("key: 'abandoned'"),
  `${HISTORY_PAGE} lost the Abandoned filter — an abandoned batch is history too`
);
// Pagination is against the endpoint's total/offset, not a client-side slice.
assert.match(
  historyCode,
  /loadHistory\(\{ status, limit: PAGE_SIZE, offset \}\)/,
  `${HISTORY_PAGE} no longer paginates against the endpoint`
);
assert.doesNotMatch(
  historyCode,
  /\.slice\(offset/,
  `${HISTORY_PAGE} slices a fully-fetched list instead of paginating server-side`
);

/* ── 2. Reports is Administrator-only, server-side ──────────────────────── */

// The matrix itself.
for (const cap of ['reports.view', 'reports.export'] as const) {
  assert.equal(can('admin', cap), true, `an Administrator must have ${cap}`);
  assert.equal(can('member', cap), false, `a User must NOT have ${cap}`);
  assert.equal(can('viewer', cap), false, `a legacy viewer must NOT have ${cap}`);
}

// The endpoint gate, and the fact that it runs BEFORE any data is read.
assert.match(
  reportsApiCode,
  /requireCapability\(\s*req,\s*res,\s*wantsCsv \? 'reports\.export' : 'reports\.view'\s*\)/,
  `${REPORTS_API} no longer gates on reports.view / reports.export`
);
const gateAt = reportsApiCode.indexOf('requireCapability');
const rpcAt = reportsApiCode.indexOf("rpc('report_summary'");
assert.ok(gateAt > -1 && rpcAt > -1, `${REPORTS_API} lost either its gate or its query`);
assert.ok(
  gateAt < rpcAt,
  `${REPORTS_API} reads the report before checking the capability — a User would get data with their 403`
);
assert.doesNotMatch(
  reportsApiCode,
  /getAuthContext\(/,
  `${REPORTS_API} resolves auth without the capability gate — requireCapability is the only way in`
);
// The page must surface a 403 rather than drawing zeros.
assert.match(
  clientCode,
  /if \(status === 403\) return \{ kind: 'forbidden'/,
  `${CLIENT} no longer maps a 403 to a forbidden state`
);
assert.match(
  reportsCode,
  /failure\.kind === 'forbidden'/,
  `${REPORTS_PAGE} no longer tells a User that Reports is Administrator-only`
);

/* ── 3. Retention deletes the source PDF and nothing else ───────────────── */

const entries: StorageEntry[] = [
  { name: 'statement-august.pdf', id: 'a' },
  { name: 'STATEMENT.PDF', id: 'b' },
  { name: 'extraction_summary.json', id: 'c' },
  { name: 'check_0001.png', id: 'd' },
  { name: 'images', id: null },
  { name: 'pages', id: null },
  { name: 'ocr_results', id: null },
  { name: 'images/check_0001.png', id: 'e' },
];
const doomed = pdfObjectsIn(jobStoragePrefix('job_42'), entries);
assert.deepEqual(
  doomed.sort(),
  ['jobs/job_42/STATEMENT.PDF', 'jobs/job_42/statement-august.pdf'],
  'pdfObjectsIn must select exactly the source PDFs directly inside the job folder'
);
for (const kept of ['extraction_summary.json', 'check_0001.png', 'images', 'pages', 'ocr_results']) {
  assert.ok(
    !doomed.some((p) => p.includes(kept)),
    `retention would delete ${kept} — only the source PDF may go`
  );
}
// Nothing outside the one job folder is nameable.
assert.ok(
  doomed.every((p) => p.startsWith('jobs/job_42/')),
  'pdfObjectsIn produced a path outside the job folder it was given'
);

// The sweep must not touch the tables that hold the extracted data or history.
for (const table of ['checks', 'matches', 'batches', 'check_jobs']) {
  assert.doesNotMatch(
    sweepCode,
    new RegExp(`from\\(['"]${table}['"]\\)`),
    `${SWEEP} touches the ${table} table — the sweep may only delete storage objects`
  );
}
assert.doesNotMatch(
  sweepCode,
  /\.delete\(\)/,
  `${SWEEP} issues a database delete — only storage objects may be removed`
);
assert.match(
  sweepCode,
  /storage\.from\(bucket\)\.remove\(pdfPaths\)/,
  `${SWEEP} no longer removes the stored object — a retention promise that only updates a row is not deletion`
);
assert.match(
  sweepCode,
  /pdfObjectsIn\(prefix,/,
  `${SWEEP} removes something other than the PDF filter's output`
);

// The migration must not delete data either.
for (const table of ['checks', 'matches', 'batches', 'usage_ledger']) {
  assert.doesNotMatch(
    sql,
    new RegExp(`DELETE\\s+FROM\\s+public\\.${table}`, 'i'),
    `migration 035 deletes rows from ${table} — the extracted data and the history must survive`
  );
  assert.doesNotMatch(
    sql,
    new RegExp(`DROP\\s+TABLE[^;]*${table}`, 'i'),
    `migration 035 drops ${table}`
  );
}
// The one permitted write outside upload_retention: clearing the dead link.
const checkJobWrites = [...sql.matchAll(/UPDATE\s+public\.check_jobs\s+SET\s+([^\n]*)/gi)].map(
  (m) => m[1].trim()
);
assert.ok(checkJobWrites.length > 0, 'migration 035 no longer clears the deleted file URL');
for (const w of checkJobWrites) {
  assert.match(
    w,
    /^pdf_url\s*=\s*NULL/i,
    `migration 035 writes "${w}" to check_jobs — only pdf_url may be cleared`
  );
}

/* ── 4. The sweep is idempotent ─────────────────────────────────────────── */

// 14 days, from completion, in both the TS and the SQL.
assert.equal(RETENTION_DAYS, 14, 'the agreed retention window is 14 days, not 7');
assert.match(
  sql,
  /upload_retention_days\(\)\s*RETURNS INTEGER AS \$\$ SELECT 14 \$\$/,
  'migration 035 no longer says 14 days — the SQL and lib/retention.ts must agree'
);
assert.match(
  sql,
  /completed_at \+ \(public\.upload_retention_days\(\) \|\| ' days'\)::interval/,
  'migration 035 no longer counts the window from completion'
);
const completed = '2026-08-10T12:00:00.000Z';
assert.equal(
  retentionDeleteAfter(completed),
  '2026-08-24T12:00:00.000Z',
  'retentionDeleteAfter must be completion + 14 days'
);

// Two passes over the same row, with the file removed in between. The second
// pass must settle as a success, never as a failure that retries for ever.
let store = ['jobs/job_42/statement-august.pdf'];
const listing = (): StorageEntry[] =>
  store.map((p) => ({ name: p.split('/').pop() as string, id: 'x' }));

const pass = () => {
  const pdfPaths = pdfObjectsIn('jobs/job_42', listing());
  const out = sweepOutcome({ pdfPaths });
  if (out.outcome === 'deleted') store = store.filter((p) => !pdfPaths.includes(p));
  return out;
};

const first = pass();
assert.equal(first.outcome, 'deleted');
assert.equal(first.objects_deleted, 1);
const second = pass();
assert.equal(
  second.outcome,
  'missing',
  'a file that is already gone must be a success — otherwise the row retries for ever'
);
assert.notEqual(second.outcome, 'failed', 'a second sweep must not fail');
assert.equal(second.objects_deleted, 0, 'a second sweep must not claim to have deleted anything');
// And the outcome of the second pass is terminal, so the row is never queued again.
assert.equal(isSettled(first.outcome), true);
assert.equal(isSettled(second.outcome), true);
assert.equal(isSettled('failed'), false, 'a real failure must stay retryable');

// The tally agrees: two passes report one deletion in total, not two.
const t2 = tally(tally(EMPTY_TALLY, first.outcome, first.objects_deleted), second.outcome, second.objects_deleted);
assert.equal(t2.objects_deleted, 1, 'two sweeps must not report two deletions of one file');
assert.equal(t2.failed, 0, 'two sweeps over one file must report no failures');

// The database side of the same property.
assert.match(
  sql,
  /ON CONFLICT \(tenant_id, storage_bucket, storage_prefix, job_id\) DO NOTHING/,
  'migration 035 no longer absorbs a repeated schedule — completing a batch twice would queue the file twice'
);
assert.match(
  sql,
  /CREATE UNIQUE INDEX IF NOT EXISTS upload_retention_object_uniq/,
  'migration 035 lost the unique index that makes scheduling idempotent'
);
// The due query must exclude the terminal states, or every sweep redoes the lot.
const dueWhere = /upload_retention_due[\s\S]*?WHERE r\.status IN \(([^)]*)\)/.exec(sql);
assert.ok(dueWhere, 'migration 035 upload_retention_due no longer filters on status');
assert.equal(
  dueWhere![1].replace(/\s/g, ''),
  "'pending','failed'",
  'upload_retention_due must return only pending and failed rows — including a settled one re-sweeps it'
);
assert.match(
  sql,
  /IF _row\.status IN \('deleted', 'missing'\) THEN[\s\S]{0,200}already_settled/,
  'complete_upload_retention no longer short-circuits an already-settled row'
);
// 'missing' must be recorded as a success, i.e. it settles the row.
assert.match(
  sql,
  /deleted_at\s*=\s*CASE WHEN p_outcome IN \('deleted', 'missing'\) THEN NOW\(\)/,
  "migration 035 no longer settles a 'missing' row — an already-deleted file would retry for ever"
);
// The schedule is written by the database, so no API path can forget it.
assert.match(
  sql,
  /CREATE TRIGGER batches_schedule_retention[\s\S]{0,200}AFTER INSERT OR UPDATE OF status ON public\.batches/,
  'migration 035 no longer schedules retention from the batch completing'
);

/* ── 5. Tokens only ────────────────────────────────────────────────────── */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?(?![0-9a-zA-Z])/g;
const PALETTE =
  /(?:bg|text|border|ring|from|via|to|divide|fill|stroke|shadow|outline|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?![0-9a-zA-Z])/g;

for (const rel of OWNED_TS) {
  const src = read(rel);
  assert.equal(src.match(HEX), null, `${rel} has a hardcoded hex — colour belongs to the token file`);
  assert.equal(
    src.match(PALETTE),
    null,
    `${rel} uses a raw Tailwind palette class — use the Kyriq tokens`
  );
}
// Glass on containers, never on rows.
for (const rel of [HISTORY_PAGE, REPORTS_PAGE]) {
  assert.doesNotMatch(
    strip(read(rel)),
    /<Tr[^>]*className="[^"]*glass/,
    `${rel} puts glass on a table row — glass belongs on the container and the sticky header`
  );
}
// Never nest two blurred surfaces. Button's `secondary` carries `glass-card`
// and `ghost` carries its own backdrop-blur, so neither may sit inside the
// blurred table shell or a GlassCard. History's row action is a hairline pill
// instead — once per row, a nested blur would also be once per row.
const rowAction = /const ROW_ACTION =([\s\S]*?);/.exec(historyCode);
assert.ok(rowAction, `${HISTORY_PAGE} no longer defines the non-blurring row action`);
assert.doesNotMatch(
  rowAction![1],
  /glass-card|backdrop-blur/,
  `${HISTORY_PAGE} row action is a blurred surface inside the blurred table shell`
);
const tbody = /<Tbody>([\s\S]*?)<\/Tbody>/.exec(historyCode);
assert.ok(tbody, `${HISTORY_PAGE} lost its table body`);
assert.doesNotMatch(
  tbody![1],
  /<Button/,
  `${HISTORY_PAGE} renders a Button inside a table row — secondary carries glass-card, so that is a blur inside a blur, once per row`
);
for (const rel of [HISTORY_PAGE, REPORTS_PAGE]) {
  assert.doesNotMatch(
    strip(read(rel)),
    /variant="ghost"/,
    `${rel} uses the ghost Button, which blurs — inside a GlassCard that nests two blurred surfaces`
  );
}

// The row actions must stay reachable at phone width: the shell clips, so the
// scroll container has to scroll horizontally.
for (const rel of [HISTORY_PAGE, REPORTS_PAGE]) {
  assert.match(
    strip(read(rel)),
    /<TableScroll className="[^"]*overflow-x-auto/,
    `${rel} has a min-width table inside a clipping shell with no horizontal scroll — ` +
      `the last column (the row action) would be unreachable at 400px`
  );
}

/* ── 6. The promise is in the privacy policy ───────────────────────────── */

const privacy = read(PRIVACY);
assert.match(
  privacy,
  /deleted 14 days after the reconciliation/i,
  `${PRIVACY} does not state the 14-day upload retention promise`
);
assert.match(
  privacy,
  /counted from completion, not from upload/i,
  `${PRIVACY} does not say the window runs from completion`
);
assert.match(
  privacy,
  /extracted cheque data, the match and approval results, and the reconciliation history remain/i,
  `${PRIVACY} does not say what survives the deletion`
);

console.log('\nall History / Reports / retention checks passed');
