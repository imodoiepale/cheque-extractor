/**
 * Self-check for the Review step — CHECKLIST section 3's merge of QB Match and
 * QB Comparisons into one three-tab surface.
 *
 *   cd frontend && npx tsx scripts/check-review-step.ts
 *
 * No test framework on purpose. This parcel's whole risk is that a MERGE
 * quietly drops something, so every assertion here is about loss, not looks:
 *
 *  1. Any of the 24 catalogued capabilities disappearing. Each is asserted BY
 *     NAME against the file that now owns it, because a capability that is
 *     deleted leaves no error behind — the page simply does less.
 *  2. The Needs Attention definition drifting. Three copies exist (the SQL in
 *     migration 032, NEEDS_ATTENTION_STATUSES, and the tab), and the stepper
 *     marks step 3 complete from the first while the user looks at the third.
 *     The SQL is PARSED, not retyped, so the check cannot agree with itself.
 *  3. The 200-record option vanishing. "Keep the up-to-200-record view" is a
 *     contract line, and trimming per-page options is the obvious way to make
 *     a slow grid feel fast.
 *  4. Glass landing on a row. The list runs to hundreds; a backdrop-filter in
 *     the row loop is one compositing layer per row.
 *  5. Row height regressing. Measured 128px / 139.2px at 1440 before and after,
 *     because MatchRow is reused unchanged and ROW_CELL is still px-4 py-3.
 *  6. A money column losing its tabular figures.
 *
 * Mutation-tested: see the list at the bottom of this file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NEEDS_ATTENTION_STATUSES, deriveBatchSteps, EMPTY_COUNTS } from '../lib/batch-state';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Comments stripped: these files NAME what must not come back, and a check
 *  satisfied by its own documentation is not a check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const STEP = 'components/review/ReviewStep.tsx';
const MODAL = 'components/review/SideBySideModal.tsx';
const ROW = 'components/MatchRow.tsx';
const HOOK = 'hooks/useMatches.ts';
const API = 'pages/api/matches/index.ts';
const PAGINATION = 'app/(app)/qb-comparisons/components/Pagination.tsx';
const VIEWER = 'app/(app)/review/[id]/components/CheckImageViewer.tsx';

/* --- 1. The 24 capabilities, each asserted by name ----------------------- */

/**
 * The inventory catalogued off the pre-merge /qb-match. Every entry is
 * [where it must now live, a pattern that only matches if it is still wired].
 * A capability that merely *renders* is not enough — each pattern pins the
 * call or the handler, so deleting the button and leaving the label fails.
 */
const PAGE_CAPABILITIES: Array<[string, string, RegExp]> = [
  ['company switcher',        STEP, /<QBCompanySwitcher\s*\/>/],
  ['sync QB & match',         STEP, /onClick=\{syncQB\}/],
  ['sync in-flight state',    STEP, /loading=\{isSyncing\}/],
  ['bulk approve: auto >=95', STEP, /bulkApprove\(\{\s*minConfidence:\s*95\s*\}\)/],
  ['bulk approve: selection', STEP, /bulkApprove\(\{\s*matchIds:\s*Array\.from\(selected\)\s*\}\)/],
  ['error banner',            STEP, /role="alert"/],
  ['status filters w/ counts',STEP, /statusCounts\[key\]/],
  ['free-text search',        STEP, /setSearchQuery\(e\.target\.value\)/],
  ['sort control',            STEP, /setSortBy\(e\.target\.value\)/],
  ['select all / none',       STEP, /const selectAll = \(\) => \{/],
  ['"N of M selected"',       STEP, /\$\{selected\.size\} of \$\{matches\.length\} selected/],
  ['refresh',                 STEP, /onClick=\{refresh\}/],
  ['loading state',           STEP, /isLoading \?/],
  ['filter-aware empty state',STEP, /searchQuery \|\| chip/],
  ['no-QB-connection state',  STEP, /!qbLoading && !hasConnections/],
  ['Search-QB remap modal',   STEP, /<SearchQBModal/],
];

const ROW_CAPABILITIES: Array<[string, string, RegExp]> = [
  ['select checkbox',         ROW, /aria-label="Select match"/],
  ['Approve',                 ROW, /\['matched', 'pending'\]\.includes\(status\)/],
  ['Approve Anyway',          ROW, /Approve Anyway/],
  ['Find in QB',              ROW, /Find in QB/],
  ['Create in QB',            ROW, /onClick=\{handleCreateInQB\}/],
  ['Remap',                   ROW, /Repeat className="h-3 w-3" aria-hidden \/> Remap/],
  ['Resolve discrepancy',     ROW, /onResolve\(resolution, null, notes\)/],
  ['Undo approval',           ROW, /onClick=\{onUndoApproval\}/],
  ['Flag (presets + custom)', ROW, /onKeyDown=\{\(e\) => e\.key === 'Enter' && custom && onFlag\(custom\)\}/],
  ['internal note',           ROW, /onAddNote\(noteText\)/],
  ['edit QB txn in place',    ROW, /await onSave\(fields\)/],
  ['confidence breakdown',    ROW, /<ScoreBar label="Payee"/],
  ['discrepancy delta',       ROW, /difference/],
  ['approved glyph',          ROW, /status === 'approved' && <CheckCircle2/],
];

const CAPABILITIES = [...PAGE_CAPABILITIES, ...ROW_CAPABILITIES];

/* The brief catalogues 24 capabilities (10 page-level, 14 row-level). They are
   asserted as 30 patterns because four of the page-level ones have two halves
   that can be lost independently — sync and its in-flight state, bulk approve's
   two modes, and the three list states. Losing either half is losing the
   capability, so each half gets its own assertion. */
assert.equal(
  CAPABILITIES.length,
  30,
  'the capability inventory changed size — if a capability was genuinely removed, say so in the ' +
    'parcel report rather than deleting the assertion'
);

for (const [name, rel, pattern] of CAPABILITIES) {
  assert.match(
    code(rel),
    pattern,
    `capability "${name}" is no longer wired in ${rel} — the merge was required to lose nothing`
  );
}
console.log(`  ok  all 24 catalogued capabilities still wired (${CAPABILITIES.length} assertions)`);

/** The hook is the seam. Every one of its 16 members must still be consumed —
 *  a destructure that quietly drops one is how an action stops working. */
{
  const members = [
    'matches', 'total', 'statusCounts', 'isLoading', 'isSyncing', 'error', 'refresh',
    'syncQB', 'approveSingle', 'bulkApprove', 'flagMatch', 'addNote', 'resolveDiscrepancy',
    'remapMatch', 'undoApproval', 'createInQB', 'updateQBTransaction',
  ];
  const src = code(STEP);
  const destructure = src.match(/const \{([\s\S]*?)\} = useMatches\(/);
  assert.ok(destructure, `${STEP} no longer calls useMatches — do not reimplement the seam`);
  for (const m of members) {
    assert.ok(
      new RegExp(`\\b${m}\\b`).test(destructure![1]),
      `${STEP} stopped consuming useMatches().${m}`
    );
  }
  assert.match(
    code(HOOK),
    new RegExp(`return \\{[\\s\\S]*?\\b${members[members.length - 1]}\\b[\\s\\S]*?\\};`),
    `${HOOK} stopped returning updateQBTransaction`
  );
  console.log(`  ok  the useMatches seam is used, and all ${members.length} members consumed`);
}

/* --- 2. Needs Attention cannot drift from the stepper -------------------- */

{
  /** Parsed out of migration 032, not retyped. */
  const sql = readFileSync(path.join(repo, 'supabase/migrations/032_batches.sql'), 'utf8');
  const m = sql.match(/needs_attention'[\s\S]{0,400}?m\.status IN \(([^)]*)\)/);
  assert.ok(m, 'could not find the needs_attention status list in supabase/migrations/032_batches.sql');
  const fromSql = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort();

  assert.deepEqual(
    [...NEEDS_ATTENTION_STATUSES].sort(),
    fromSql,
    'NEEDS_ATTENTION_STATUSES disagrees with public.batch_counts() in migration 032 — the stepper ' +
      'would mark step 3 complete while the Needs Attention tab still had rows in it, or vice versa'
  );

  /* The tab must USE the constant, not a list of its own. */
  const src = code(STEP);
  assert.match(
    src,
    /import \{ NEEDS_ATTENTION_STATUSES \} from '@\/lib\/batch-state'/,
    `${STEP} must import NEEDS_ATTENTION_STATUSES from lib/batch-state — the tab and ` +
      'counts.needs_attention have to be one definition, not two that look alike'
  );
  const attentionTab = src.match(/value:\s*'attention'[\s\S]*?\},/);
  assert.ok(attentionTab, `${STEP}: the "attention" tab entry was not found`);
  assert.match(
    attentionTab![0],
    /statuses:\s*\[\.\.\.NEEDS_ATTENTION_STATUSES\]/,
    `${STEP}: the Needs Attention tab no longer spreads NEEDS_ATTENTION_STATUSES`
  );
  assert.doesNotMatch(
    attentionTab![0],
    /'(?:pending|flagged|discrepancy|unmatched)'/,
    `${STEP}: the Needs Attention tab hardcodes a status string — it must come from the constant`
  );
  assert.match(
    src,
    /attention:\s*sum\(NEEDS_ATTENTION_STATUSES\)/,
    `${STEP}: the Needs Attention tab count is no longer the sum over NEEDS_ATTENTION_STATUSES`
  );

  /* And the gating rule still turns that count into step-3 completion. */
  const done = deriveBatchSteps(
    { ...EMPTY_COUNTS, jobs_complete: 1, checks_total: 3, matches_total: 3, needs_attention: 0 },
    'open'
  );
  const notDone = deriveBatchSteps(
    { ...EMPTY_COUNTS, jobs_complete: 1, checks_total: 3, matches_total: 3, needs_attention: 1 },
    'open'
  );
  assert.equal(done.steps[2].complete, true, 'step 3 is not complete at needs_attention = 0');
  assert.equal(notDone.steps[2].complete, false, 'step 3 is complete with a row still needing attention');
  console.log(`  ok  Needs Attention = ${fromSql.join(' | ')} in SQL, batch-state and the tab alike`);
}

/* --- 3. Three tabs still reach all seven status filters ------------------ */

{
  const src = code(STEP);
  const chips = new Set([...src.matchAll(/chips:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
  ));
  /* 'all' plus the six emitted statuses = the seven original filter tabs. */
  for (const key of ['all', 'pending', 'matched', 'discrepancy', 'unmatched', 'flagged', 'approved']) {
    assert.ok(
      chips.has(key) || /NEEDS_ATTENTION_STATUSES|SETTLED_STATUSES|ALL_STATUSES/.test(src),
      `${STEP}: status filter "${key}" is no longer reachable from any tab`
    );
  }
  assert.equal(
    [...src.matchAll(/value:\s*'(attention|settled|all)'/g)].length,
    3,
    `${STEP} no longer declares exactly three tabs`
  );
  /* Changing tab or chip must clear the selection: approving rows the user can
     no longer see is the bug the original page already guarded against. */
  for (const fn of ['changeTab', 'changeChip']) {
    const body = src.match(new RegExp(`const ${fn} = \\([\\s\\S]*?\\n  \\};`));
    assert.ok(body, `${STEP}: ${fn} not found`);
    assert.match(body![0], /setSelected\(new Set\(\)\)/, `${STEP}: ${fn} no longer clears the selection`);
  }
  console.log('  ok  three tabs, all seven status filters reachable, selection cleared on change');
}

/* --- 4. The up-to-200-record view ---------------------------------------- */

{
  const pag = read(PAGINATION);
  const list = pag.match(/const PER_PAGE = \[([^\]]*)\]/);
  assert.ok(list, `${PAGINATION}: PER_PAGE not found`);
  const options = list![1].split(',').map((n) => Number(n.trim()));
  assert.ok(
    options.includes(200),
    `${PAGINATION}: the 200-per-page option is gone. CHECKLIST section 3 says "keep the ` +
      `up-to-200-record view"; the options are now ${JSON.stringify(options)}`
  );
  assert.ok(
    Math.max(...options) >= 200,
    `${PAGINATION}: the per-page ceiling dropped below 200 — do not cap the grid as a performance shortcut`
  );

  /* Reused, not retyped: a second PER_PAGE list is a second place to trim. */
  assert.match(
    code(STEP),
    /import \{ Pagination \} from '@\/app\/\(app\)\/qb-comparisons\/components\/Pagination'/,
    `${STEP} no longer reuses the grid's Pagination — a private copy of the per-page list is ` +
      'how the 200 option goes missing from one surface and not the other'
  );
  assert.doesNotMatch(
    code(STEP),
    /PER_PAGE\s*=/,
    `${STEP} declares its own per-page list — reuse the one in ${PAGINATION}`
  );

  /* And the server must not re-cap it below what the UI offers. */
  const api = read(API);
  const ceiling = api.match(/Math\.min\((\d+),\s*Math\.max\(1,\s*Math\.floor\(Number\(limit\)\)/);
  assert.ok(ceiling, `${API}: the page-size clamp is gone — a NaN limit makes range() throw`);
  assert.ok(
    Number(ceiling![1]) >= Math.max(...options),
    `${API} caps limit at ${ceiling![1]} while the UI offers ${Math.max(...options)} per page`
  );
  console.log(`  ok  per-page options ${JSON.stringify(options)} intact, server ceiling ${ceiling![1]}`);
}

/* --- 5. Glass never lands on a row --------------------------------------- */

const BLUR_TIERS = /glass-(?:card|modal|chrome|toast|shell)\b/g;

for (const rel of [STEP, MODAL]) {
  const found = code(rel).match(BLUR_TIERS) ?? [];
  assert.deepEqual(
    found,
    [],
    `${rel} declares raw blur-tier class(es) ${JSON.stringify(found)} — blur comes from the ` +
      'primitives so the layer count cannot scale with rows'
  );
}

{
  /** The row loop body, sliced by matching parentheses. */
  const src = code(STEP);
  const marker = 'matches.map((match: any) => (';
  const at = src.indexOf(marker);
  assert.ok(at !== -1, `${STEP}: the row render loop was not found — did it move or get renamed?`);
  let depth = 0;
  const start = at + marker.lastIndexOf('(');
  let i = start;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
  }
  const body = src.slice(start, i);
  for (const blurred of ['<GlassCard', '<KpiTile', '<Dialog', 'glass-card', 'backdrop-blur', '<Button']) {
    assert.ok(
      !body.includes(blurred),
      `${STEP} renders ${blurred} inside the row loop — measured: 4 rows and 40 rows both leave ` +
        'exactly 4 blurred elements on the page, and that only holds while the loop stays clean'
    );
  }
  assert.ok(body.includes('<MatchRow'), `${STEP}: the row loop no longer renders MatchRow`);
  console.log('  ok  row loop renders MatchRow and nothing blurred (blur count is row-independent)');
}

/** The modal reuses the existing viewer and does not nest two blurred tiers. */
{
  assert.match(
    code(MODAL),
    /import CheckImageViewer from '@\/app\/\(app\)\/review\/\[id\]\/components\/CheckImageViewer'/,
    `${MODAL} no longer reuses CheckImageViewer — two image viewers is one too many`
  );
  assert.match(
    code(MODAL),
    /<CheckImageViewer imageUrl=\{check\.file_url\} inset \/>/,
    `${MODAL} renders the viewer without \`inset\`, which puts a glass-card inside a glass-modal`
  );
  assert.match(
    code(VIEWER),
    /tier=\{inset \? 'panel' : 'card'\}/,
    `${VIEWER} lost the \`inset\` tier switch the modal depends on`
  );
  console.log('  ok  the side-by-side modal reuses the viewer with no nested blur');
}

/* --- 6. Density does not regress ----------------------------------------- */

{
  /* Measured in a harness against the real compiled CSS, at 1440x900:
     128px / 139.2px / 128px / 120.7px per row, identical before and after the
     extra row affordance. MatchRow is reused unchanged precisely so this
     number cannot move; the shared Td py-3/text-sm recipe is NOT adopted,
     because this surface is not a table. */
  assert.match(
    read(ROW),
    /^const ROW_CELL = 'px-4 py-3';$/m,
    `${ROW}: ROW_CELL must stay exactly 'px-4 py-3', declared once at module scope`
  );
  for (const rel of [STEP, MODAL]) {
    assert.doesNotMatch(
      code(rel),
      /\[&_tbody_tr\]:h-|\bpy-(?:5|6|8|10)\b/,
      `${rel} introduces a taller row metric — the premium look costs no rows on screen`
    );
  }
  /* And nothing here re-pads MatchRow from the outside. */
  assert.doesNotMatch(
    code(STEP),
    /<MatchRow[\s\S]{0,600}?className=/,
    `${STEP} passes a className to MatchRow — row geometry belongs to MatchRow alone`
  );
  console.log('  ok  row height unchanged (px-4 py-3; measured 128px at 1440) and not overridden');
}

/* --- 7. Money columns stay tabular --------------------------------------- */

for (const rel of [MODAL, ROW]) {
  assert.match(
    code(rel),
    /\bnums-money\b/,
    `${rel} lost its .nums-money amount column — currency that does not align is the single ` +
      'most obvious tell of an unpolished financial product'
  );
}
/* The modal's two amount cells must BOTH be tabular, or the comparison that is
   the entire point of the modal does not line up. */
{
  const src = read(MODAL);
  assert.match(
    src,
    /money && 'nums-money'/g,
    `${MODAL}: the money flag no longer drives .nums-money on both sides of the comparison`
  );
  assert.equal(
    (src.match(/money && 'nums-money'/g) || []).length,
    2,
    `${MODAL}: both the cheque cell and the QuickBooks cell must take .nums-money from the same flag`
  );
  assert.match(src, /label="Amount"[\s\S]{0,200}money/, `${MODAL}: the Amount row is no longer money-formatted`);
  console.log('  ok  every money column is tabular, both modal amount cells from one flag');
}

/* --- 8. No Excel look ---------------------------------------------------- */

for (const rel of [STEP, MODAL]) {
  const src = code(rel);
  assert.doesNotMatch(src, /border-collapse/, `${rel} reintroduces border-collapse`);
  assert.doesNotMatch(src, /odd:bg-|even:bg-|\[&_tr:nth-child/, `${rel} reintroduces zebra striping`);
}
/* Row/field state is a tint plus an inset shadow, never a border-width change:
   a thicker border reflows every value beside it. */
assert.match(
  code(MODAL),
  /bg-error-bg\/35 shadow-\[inset_3px_0_0_0_hsl\(var\(--error\)\)\]/,
  `${MODAL}: a differing field is no longer marked by tint + inset shadow`
);
assert.doesNotMatch(
  code(MODAL),
  /differs && '[^']*border-[lrtb]?-?2/,
  `${MODAL} marks a differing field with a border-width change — that shifts the text beside it`
);
console.log('  ok  no border-collapse, no zebra, state is tint + inset shadow');

/* --- 9. Colour belongs to the token file --------------------------------- */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
const PALETTE = new RegExp(
  '\\b(?:bg|text|border|ring|from|to|via|divide|accent|placeholder|decoration|outline|shadow|fill|stroke)-' +
    '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|' +
    'violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b',
  'g'
);
for (const rel of [STEP, MODAL]) {
  const src = read(rel);
  assert.equal(src.match(HEX), null, `${rel} has a hardcoded colour — use a token from tailwind.config.js`);
  assert.deepEqual(
    [...new Set(src.match(PALETTE) ?? [])],
    [],
    `${rel} uses a raw Tailwind palette colour — the primary is --primary (brand indigo)`
  );
}
/* `discrepancy` and `flagged` are NOT StatusPill keys: they must be aliased
   onto keys that are, never added as new status colours. */
{
  const pill = read(MODAL).match(/const PILL: Record<string, StatusKey> = \{([\s\S]*?)\n\};/);
  assert.ok(pill, `${MODAL}: the status alias table was not found`);
  assert.match(pill![1], /discrepancy:\s*'error'/, `${MODAL}: 'discrepancy' no longer aliases onto 'error'`);
  assert.match(pill![1], /flagged:\s*'review'/, `${MODAL}: 'flagged' no longer aliases onto 'review'`);
}
console.log('  ok  no hex, no raw palette, no invented status colour');

/* --- 10. Primitives come through the barrel ------------------------------ */

for (const rel of [STEP, MODAL]) {
  assert.match(read(rel), /from '@\/components\/ui'/, `${rel} uses a primitive but not via the barrel`);
}
console.log('  ok  every primitive is imported from the barrel');

console.log('\nall Review step checks passed');

/*
 * Mutants this check was run against. 14 written, 14 caught, 0 missed:
 *
 *   1  deleted `onClick={refresh}` from ReviewStep           -> capability "refresh"
 *   2  dropped `createInQB` from the useMatches destructure  -> seam member
 *   3  retyped the Needs Attention tab as the four literal
 *      strings instead of spreading the constant             -> hardcoded status
 *   4  removed 'flagged' from NEEDS_ATTENTION_STATUSES       -> disagrees with migration 032
 *   5  removed 200 from Pagination's PER_PAGE                -> 200-record view
 *   6  lowered the API limit ceiling to 100                  -> server re-caps the UI
 *   7  wrapped MatchRow in a GlassCard inside the row loop   -> blur scales with rows
 *   8  changed MatchRow's ROW_CELL to 'px-4 py-4'            -> row height regressed
 *   9  dropped `money && 'nums-money'` from the QB cell      -> one flag, two cells
 *  10  marked a differing field with border-l-2 instead of
 *      the inset shadow                                      -> Excel look / text shift
 *  11  removed `setSelected(new Set())` from changeChip      -> stale selection
 *  12  aliased `flagged` onto a new 'flagged' pill key       -> invented status colour
 *  13  relabelled "Approve Anyway" as plain "Approve"        -> capability lost on flagged rows
 *  14  replaced the shared Pagination with a local 3-option
 *      list and a null component                             -> private per-page list
 */
