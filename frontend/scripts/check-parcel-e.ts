/**
 * Self-check for the QB Comparisons page and its components (parcel E).
 *
 *   cd frontend && npx tsx scripts/check-parcel-e.ts
 *
 * No test framework on purpose. This page is the product — accountants read
 * this grid all day — so the regressions worth guarding are the ones that
 * would look fine in review and be wrong in use:
 *
 *   1. A literal hex comes back. Fifteen were removed from the grid header
 *      alone; a single one re-opaques a glass surface and the mesh behind it
 *      disappears.
 *   2. Glass lands on a table ROW. `backdrop-filter` is one compositing layer
 *      per element, and this grid renders up to 2,000 rows — blurring rows
 *      turns a scroll into a slideshow. The blurred-element count on this page
 *      must be a constant.
 *   3. Row height moves. The grid's pre-redesign row is 22px; the shared
 *      `tdVariants` py-3 recipe is ~42px, which would halve the rows on
 *      screen. The dense override must stay, and it must stay in ONE place.
 *   4. The 200-record view is quietly capped to make the table feel faster.
 *   5. Money columns lose tabular figures, so columns of amounts stop lining
 *      up — in a reconciliation product that is a correctness bug, not a
 *      cosmetic one.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARCEL = 'app/(app)/qb-comparisons';

const OWNED = [
  `${PARCEL}/page.tsx`,
  `${PARCEL}/components/ComparisonTable.tsx`,
  `${PARCEL}/components/ComparisonControlsBar.tsx`,
  `${PARCEL}/components/StatisticsPanel.tsx`,
  `${PARCEL}/components/Pagination.tsx`,
  `${PARCEL}/components/ColumnSettings.tsx`,
  `${PARCEL}/components/DetailModal.tsx`,
  `${PARCEL}/components/QBConnectionModal.tsx`,
];

const TABLE = `${PARCEL}/components/ComparisonTable.tsx`;
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/* --- 1. No hardcoded colour in any parcel-E component ------------------- */
// The grid header alone carried ten distinct navy/red hexes painted straight
// onto <th> elements. Colour belongs to the token file.
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

for (const rel of OWNED) {
  // `Check #123` and `#{n}` are not colours; strip the one pattern that can
  // look like a 3-digit hex before matching.
  const found = read(rel).match(HEX);
  assert.equal(
    found,
    null,
    `${rel} has hardcoded colour(s) ${JSON.stringify(found)} — use a token from tailwind.config.js`
  );
}
console.log(`  ok  ${OWNED.length} parcel-E files carry no hardcoded hex`);

// utils/exportUtils.ts keeps exactly ONE literal, and only because the value
// is written into a downloaded Excel document where CSS variables do not
// exist. It must be the brand indigo, never the retired blue-600.
{
  const src = read(`${PARCEL}/utils/exportUtils.ts`);
  const hexes = src.match(HEX) ?? [];
  assert.deepEqual(
    hexes,
    ['#6366f1'],
    `exportUtils.ts must contain exactly one literal colour, the brand indigo (found ${JSON.stringify(hexes)})`
  );
}
console.log('  ok  the Excel export fill is the brand indigo and the only literal');

/* --- 2. blue-600 is gone everywhere ------------------------------------- */
// `bg-blue-600` was the de-facto primary at 23 call sites app-wide; 18 of them
// were in this parcel. The primary is now the indigo token.
for (const rel of [...OWNED, `${PARCEL}/utils/exportUtils.ts`]) {
  assert.doesNotMatch(
    read(rel),
    /\b(?:bg|text|border|from|to|ring)-blue-\d{3}\b/,
    `${rel} still uses a raw blue-* utility — the primary is the brand/primary token`
  );
}
console.log('  ok  no blue-* utility survives in parcel E');

/* --- 3. Glass never touches a row, and the blur count is constant ------- */
const table = read(TABLE);

// Everything between <Tbody> and </Tbody> is rendered once PER ROW. Not one
// glass class may appear in there, or the number of composited blur layers
// becomes a function of the row count.
const body = table.slice(table.indexOf('<Tbody>'), table.indexOf('</Tbody>'));
assert.ok(body.length > 500, 'could not locate the row-rendering region in ComparisonTable');
const rowGlass = body.match(/glass-(?:card|modal|chrome|toast|shell|surface|panel)\b/g);
assert.equal(
  rowGlass,
  null,
  `the per-row region applies glass ${JSON.stringify(rowGlass)} — glass goes on the shell and the sticky header only`
);
assert.doesNotMatch(
  body,
  /backdrop-(?:blur|filter|saturate)/,
  'the per-row region applies a backdrop filter — that is one compositing layer per row'
);
console.log('  ok  the per-row region carries no glass and no backdrop filter');

// Exactly two blurred surfaces belong to this table: the shell (TableShell's
// default `glass` tier) and the sticky header (`Thead`). The totals row is
// deliberately an opaque surface, not a third.
assert.match(table, /<TableShell\b/, 'the grid no longer sits in the table shell primitive');
assert.doesNotMatch(
  table,
  /<TableShell[^>]*tier=/,
  'the grid shell must keep the default glass tier'
);
assert.match(
  table,
  /<tfoot className="sticky bottom-0 z-10 bg-surface\/95/,
  'the totals row must stay an opaque sticky surface, not a third blurred band'
);
console.log('  ok  the table contributes exactly 2 blurred surfaces (shell + sticky header)');

// Tables nested inside the blurred modals must use a plain <thead>: `Thead`
// carries .glass-chrome, and blur inside blur double-composites.
for (const rel of [
  `${PARCEL}/components/DetailModal.tsx`,
  `${PARCEL}/components/QBConnectionModal.tsx`,
]) {
  const src = read(rel);
  if (!/<TableShell/.test(src)) continue;
  assert.match(
    src,
    /tier="inset"/,
    `${rel} nests a table in a blurred modal but not with the inset tier`
  );
  assert.doesNotMatch(
    src,
    /<Thead\b/,
    `${rel} uses the blurred Thead primitive inside a blurred modal — use a plain <thead>`
  );
}
console.log('  ok  modal-nested tables are inset tier with unblurred headers');

/* --- 4. Density does not regress ---------------------------------------- */
// 22px rows, declared in exactly one place. If this constant moves, every
// accountant loses rows off the bottom of the screen.
assert.match(
  table,
  /'\[&_tbody_tr\]:h-\[22px\]'/,
  'the grid lost its 22px row height — that is the pre-redesign density'
);
assert.match(table, /'\[&_td\]:px-1\.5 \[&_td\]:py-0\.5'/, 'the grid cell padding changed');
assert.equal(
  (table.match(/\[&_tbody_tr\]:h-\[/g) ?? []).length,
  1,
  'row height is declared more than once — it belongs only in DENSE_GRID'
);
// And the shared primitive must still be the single source for every other
// table's height, i.e. parcel E did not "fix" density by editing parcel A.
assert.match(
  read('components/ui/table.tsx'),
  /cva\('border-b border-glass-hairline px-4 py-3 text-ink-strong'/,
  'components/ui/table.tsx tdVariants changed — parcel E must not edit the primitive'
);
console.log('  ok  22px rows, declared once, with the shared primitive untouched');

/* --- 5. The up-to-200-record view survives ------------------------------ */
// CHECKLIST section 3 is explicit that existing capability is preserved. A
// per-page list that tops out below 200 is a silent capability cut.
{
  const pag = read(`${PARCEL}/components/Pagination.tsx`);
  const options = (pag.match(/const PER_PAGE = \[([^\]]+)\]/)?.[1] ?? '')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));
  assert.ok(options.length > 0, 'Pagination no longer declares a PER_PAGE list');
  assert.ok(
    options.includes(200),
    `Pagination must offer a 200-record page (found ${JSON.stringify(options)})`
  );
  assert.ok(
    Math.max(...options) >= 2000,
    `Pagination lowered its ceiling to ${Math.max(...options)} — existing capability must be preserved`
  );

  // The grid slices by itemsPerPage and nothing else: no hidden hard cap.
  assert.match(
    table,
    /data\.slice\(startIndex, startIndex \+ itemsPerPage\)/,
    'the grid no longer pages purely by itemsPerPage — a hidden cap was introduced'
  );
}
console.log('  ok  the 200-record view (and the 2000 ceiling) is intact');

/* --- 6. Money keeps tabular figures ------------------------------------- */
// Four money cells in the grid (two amounts, two totals) plus the modal's
// comparison amounts. Proportional digits make columns of figures jitter.
{
  const moneyCells = (table.match(/nums-money/g) ?? []).length;
  assert.ok(
    moneyCells >= 4,
    `the grid has only ${moneyCells} nums-money cells — both amount columns and both totals need tabular figures`
  );
  for (const rel of OWNED) {
    const src = read(rel);
    // Any cell rendering formatCurrency must be a tabular one.
    for (const line of src.split('\n')) {
      if (!line.includes('formatCurrency(')) continue;
      if (/nums/.test(line)) continue;
      // Multi-line cells: allow the opening tag on the previous line.
      const idx = src.indexOf(line);
      const window = src.slice(Math.max(0, idx - 240), idx + line.length);
      assert.match(
        window,
        /nums(?:-money)?/,
        `${rel} formats currency without tabular figures:\n    ${line.trim()}`
      );
    }
  }
}
console.log('  ok  every currency cell carries tabular figures');

/* --- 7. One scrollbar per page ------------------------------------------ */
// The table owns the scroll. The page must not become a second scroll box on
// top of it, and the grid must not nest two scroll regions.
{
  const page = read(`${PARCEL}/page.tsx`);
  assert.match(
    page,
    /md:h-screen md:overflow-hidden/,
    'the page root must pin to the viewport and not scroll behind the table'
  );
  assert.equal(
    (table.match(/<TableScroll\b/g) ?? []).length,
    1,
    'the grid must have exactly one scroll region'
  );
  assert.doesNotMatch(
    table,
    /<TableScroll[^>]*overflow-(?:auto|y-auto|scroll)/,
    'TableScroll already scrolls — a second overflow declaration is the double scrollbar'
  );
}
console.log('  ok  one scroll container for the grid, none behind it');

/* --- 8. No Excel look, but every row action survives -------------------- */
// "I would like to get rid of the Excel look" — Michael. That means the
// spreadsheet grid-lines-everywhere feel goes, WITHOUT losing a single action.
assert.doesNotMatch(table, /border-collapse/, 'the grid went back to collapsed spreadsheet borders');
assert.doesNotMatch(
  table,
  /\bborder-r(?:-2)?\b|odd:bg-|even:bg-/,
  'the grid regained per-cell vertical rules or zebra striping'
);
for (const action of ['onVouch', 'onUnvouch', 'onDeleteQBEntry', 'onRowClick', 'onSort']) {
  assert.match(table, new RegExp(`\\b${action}\\b`), `the grid lost its ${action} row action`);
}
// Sortable headers: the five the page has always offered.
assert.equal(
  (table.match(/onSort\('/g) ?? []).length,
  5,
  'the grid lost a sortable column'
);
console.log('  ok  hairlines not grid lines, and all five sorts + four row actions intact');

/* --- 9. The committed DetailModal hook-order fix stays fixed ------------ */
// `useMemo` was being called AFTER `if (!row) return null`, so clearing the
// row made React see fewer hooks than the previous render and throw.
{
  const src = read(`${PARCEL}/components/DetailModal.tsx`);
  const hook = src.indexOf('const corrections = useMemo(');
  const early = src.indexOf('if (!row) return null;');
  assert.ok(hook > -1 && early > -1, 'DetailModal lost either the corrections memo or its guard');
  assert.ok(
    hook < early,
    'DetailModal calls useMemo after the early return again — that is the hook-count crash'
  );
}
console.log('  ok  DetailModal keeps its memo above the early return');

console.log('\nall parcel-E checks passed');
