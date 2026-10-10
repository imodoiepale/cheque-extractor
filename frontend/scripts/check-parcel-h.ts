/**
 * Self-check for the QuickBooks integration surfaces, match, export and
 * billing (parcel H).
 *
 *   cd frontend && npx tsx scripts/check-parcel-h.ts
 *
 * No test framework on purpose. These are the regressions that would actually
 * ship unnoticed in a styling review of THIS parcel:
 *
 *  1. A literal hex or a raw Tailwind palette class comes back. 526 of them
 *     were migrated out of these twelve files; one returning is how the whole
 *     parcel starts drifting from the token file again.
 *  2. Glass lands on a match row. MatchRow renders once per match and the match
 *     list runs to hundreds — a backdrop-filter there is one compositing layer
 *     per row. The blur budget per file is asserted to be ZERO and the row
 *     bodies are checked for GlassCard/KpiTile specifically.
 *  3. A row height drifts. Four lists here were denser than the shared Td
 *     recipe before the redesign and each declares its own metric once.
 *  4. A money column loses its tabular figures. This is a reconciliation
 *     product; columns of currency that do not align are the obvious tell.
 *  5. A billing figure drifts from CHECKLIST section 7. The plan table is
 *     parsed out of the checklist and compared, so the page cannot quietly
 *     disagree with the contract.
 *  6. A status colour gets invented. `discrepancy` and `flagged` are not keys
 *     in STATUS_TONES, so they alias onto keys that are; a new colour here
 *     would mean the same word is two colours in two places.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { STATUS_TONES } from '../components/ui/badge';
import { tdVariants } from '../components/ui/table';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Comments stripped before the "did this come back?" checks: the comments in
 *  these files deliberately NAME what must not return, and a check that cannot
 *  tell a warning from a regression gets deleted by whoever it first blocks. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const MATCH_ROW = 'components/MatchRow.tsx';
const BILLING = 'app/(app)/billing/page.tsx';
const EXPORT = 'app/(app)/export/page.tsx';
const QB_PREVIEW = 'components/QBDataPreview.tsx';
const QB_FILTERS = 'components/QuickBooksFilters.tsx';
const SEARCH_MODAL = 'components/SearchQBModal.tsx';

/** Every file parcel H owns. */
const OWNED = [
  BILLING,
  EXPORT,
  MATCH_ROW,
  SEARCH_MODAL,
  QB_PREVIEW,
  QB_FILTERS,
  'components/QBConnectionStatus.tsx',
  'components/QBCompanySelector.tsx',
  'components/common/AIKeyWarning.tsx',
  'components/QBProviderWrapper.tsx',
];

/* --- 1. Colour belongs to the token file -------------------------------- */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

const PALETTE = new RegExp(
  '\\b(?:bg|text|border|ring|from|to|via|divide|accent|placeholder|decoration|outline|shadow|fill|stroke)-' +
    '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
    '\\d{2,3}\\b',
  'g'
);

for (const rel of OWNED) {
  const src = read(rel);

  const hexes = src.match(HEX);
  assert.equal(
    hexes,
    null,
    `${rel} has hardcoded colour(s) ${JSON.stringify(hexes)} — use a token from tailwind.config.js`
  );

  const palette = [...new Set(src.match(PALETTE) ?? [])];
  assert.deepEqual(
    palette,
    [],
    `${rel} uses raw Tailwind palette colour(s) ${JSON.stringify(palette)} — ` +
      'the primary is --primary (brand indigo) and greys are the ink-* scale'
  );
}
console.log(`  ok  ${OWNED.length} parcel-H files: no hex, no raw palette colour`);

/* --- 2. Glass on containers and headers, never on a row ------------------ */

const BLUR_TIERS = /glass-(?:card|modal|chrome|toast|shell|surface)\b/g;

/**
 * Zero for EVERY owned file. Not "a small number": every blurred surface in
 * this parcel comes through GlassCard / KpiTile / Dialog / TableShell, so a raw
 * tier class appearing in page code means somebody hand-rolled one — and the
 * place they would hand-roll it is a row.
 */
for (const rel of OWNED) {
  const found = code(rel).match(BLUR_TIERS) ?? [];
  assert.deepEqual(
    found,
    [],
    `${rel} declares raw blur-tier class(es) ${JSON.stringify(found)} — ` +
      'blur comes from the primitives, so the layer count cannot scale with rows'
  );
}
console.log('  ok  blur budget 0 raw tiers in all 12 files (count is row-independent)');

/**
 * The match row itself. GlassPanel carries no backdrop-filter; GlassCard does.
 * This is the single most expensive mistake available in this parcel.
 */
{
  const src = code(MATCH_ROW);
  assert.doesNotMatch(
    src,
    /<GlassCard\b/,
    `${MATCH_ROW} renders a GlassCard — a match row must be a GlassPanel, which carries no blur`
  );
  assert.doesNotMatch(
    src,
    /<KpiTile\b/,
    `${MATCH_ROW} renders a KpiTile, which is glass-card underneath`
  );
  assert.match(
    src,
    /<GlassPanel\b/,
    `${MATCH_ROW} no longer renders a GlassPanel — the row surface moved somewhere unaudited`
  );
  /**
   * Button's `secondary` variant IS `.glass-card` and `ghost` carries
   * `backdrop-blur-[8px]`. Either inside a row is a compositing layer per row,
   * which is why the quiet row button is a local pill.
   */
  assert.doesNotMatch(
    src,
    /<Button\b/,
    `${MATCH_ROW} renders the Button primitive. Inside a row that costs either a ` +
      'backdrop-filter (secondary is .glass-card, ghost is backdrop-blur-[8px]) or 44px of ' +
      'row height (size="sm" is min-h-tap, and tailwind-merge does not know that custom key ' +
      'so a className override of it silently loses). Use ROW_BTN_PRIMARY / ROW_BTN_QUIET.'
  );
  /* The row pill's own height. 26px, as it was before the redesign. */
  assert.match(
    src,
    /'press inline-flex min-h-0 items-center[^']*',\s*'rounded-full px-2\.5 py-1 text-xs font-semibold',/,
    `${MATCH_ROW}: ROW_BTN_BASE changed its height. It must stay min-h-0 / py-1 / text-xs — ` +
      'raising it to the 44px tap floor cost 11.5px of row height last time'
  );
  console.log('  ok  MatchRow is a GlassPanel and declares no blurred button');
}

/**
 * Nothing blurred may be rendered inside a list `.map()`.
 *
 * The body is sliced by matching the `.map(` parenthesis rather than by taking
 * a fixed number of characters: a fixed window either overruns the end of the
 * loop (and flags the empty-state card that legitimately follows it) or stops
 * short of the row body, and both failure modes end with the check deleted.
 */
function mapBody(src: string, marker: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(marker, from);
    if (at === -1) return bodies;
    let i = at + marker.lastIndexOf('(');
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) break;
    }
    bodies.push(src.slice(start, i));
    from = at + marker.length;
  }
}

/** Keyed by the EXACT render loop, so a `.map()` that only builds an id array
 *  (select-all, totals) is not confused for the row renderer. */
const ROW_LOOPS: Array<[string, string]> = [
  [EXPORT, 'jobs.map(job => {'],
  [BILLING, 'months.map(m => ('],
  [SEARCH_MODAL, 'results.map((txn) => {'],
  [QB_PREVIEW, 'filteredData.map((item) => {'],
];

for (const [rel, loop] of ROW_LOOPS) {
  const bodies = mapBody(code(rel), loop);
  assert.ok(bodies.length > 0, `${rel}: \`${loop}\` not found — did the row rendering move or get renamed?`);
  for (const body of bodies) {
    for (const blurred of ['<GlassCard', '<KpiTile']) {
      assert.ok(
        !body.includes(blurred),
        `${rel} renders ${blurred} inside ${loop} — use GlassPanel, which carries no backdrop-filter`
      );
    }
  }
}
console.log('  ok  no blurred surface inside any row loop on the 5 list surfaces');

/* --- 3. Density does not regress ---------------------------------------- */

// The shared primitive still sets row height in exactly one place.
assert.match(
  tdVariants({}),
  /\bpy-3\b/,
  'the Td primitive lost py-3 — row height is set there and nowhere else'
);

/**
 * Measured before the restyle and pinned here. Each one is declared ONCE in its
 * file, the way the comparison grid declares its own metrics, instead of
 * editing the shared primitive.
 *
 *   MatchRow        grid row        px-4 py-3   (unchanged)
 *   MatchRow        drawer          px-6 py-3   (unchanged)
 *   QBDataPreview   dense table     px-3 py-2   (~34px; the primitive's py-3
 *                                   at text-sm is ~45px and would have cost a
 *                                   quarter of the rows on screen)
 *   Export          document row    px-5 py-3   (unchanged)
 *   Export          export log row  px-5 py-2.5 (unchanged)
 *   Billing         month row       px-5 py-3.5 (unchanged)
 */
const ROW_METRICS: Array<[string, string, string]> = [
  [MATCH_ROW, 'ROW_CELL', 'px-4 py-3'],
  [MATCH_ROW, 'PANEL_CELL', 'px-6 py-3'],
  [QB_PREVIEW, 'DENSE_CELL', 'px-3 py-2'],
  [EXPORT, 'DOC_ROW', 'px-5 py-3'],
  [EXPORT, 'LOG_ROW', 'px-5 py-2.5'],
  [BILLING, 'MONTH_ROW', 'px-5 py-3.5'],
];

for (const [rel, name, value] of ROW_METRICS) {
  const src = read(rel);
  const decl = new RegExp(`^const ${name} = '${value.replace(/\./g, '\\.')}';?$`, 'm');
  assert.match(
    src,
    decl,
    `${rel}: \`${name}\` must stay exactly '${value}', declared once at module scope — ` +
      'premium look costs no rows on screen'
  );
  // And nobody may pad it back up at a call site.
  assert.doesNotMatch(
    src,
    new RegExp(`\\$\\{${name}\\}[^\`"']*\\bpy-(?:4|5|6|8)\\b`),
    `${rel} overrides ${name} to a taller row at a call site — density must not regress`
  );
}
console.log(`  ok  ${ROW_METRICS.length} row heights unchanged and each declared once`);

/* --- 4. Money columns stay tabular -------------------------------------- */

/* `code()`, not `read()`: these files EXPLAIN in comments why the money columns
   are tabular, and a check satisfied by its own documentation is no check. */
for (const rel of [MATCH_ROW, QB_PREVIEW, BILLING, SEARCH_MODAL]) {
  assert.match(
    code(rel),
    /\bnums-money\b/,
    `${rel} lost its .nums-money amount column — currency that does not align is the ` +
      'single most obvious tell of an unpolished financial product'
  );
}

/** The two QB money columns must be treated identically — `numeric` AND
 *  `.nums-money` on both, which is only guaranteed by the single predicate. */
{
  const src = read(QB_PREVIEW);
  assert.match(
    src,
    /const isMoney = \(column: string\) =>\s*column === 'Amount' \|\| column === 'Balance'/,
    `${QB_PREVIEW}: the Amount/Balance predicate moved — it exists so one column cannot ` +
      'get tabular figures while the other does not'
  );
  assert.match(src, /numeric=\{isMoney\(col\)\}/, `${QB_PREVIEW}: money columns lost numeric alignment`);
}
console.log('  ok  every money column is tabular, and the two QB ones share one predicate');

/* --- 5. Billing figures match CHECKLIST section 7 ----------------------- */

/**
 * Parsed out of the checklist rather than copied, so the page cannot quietly
 * disagree with the contract. If the client renegotiates a price, this check is
 * what fails until the page is updated too.
 */
{
  const checklist = readFileSync(path.join(repo, 'CHECKLIST.md'), 'utf8');
  const num = (s: string) => parseFloat(s.replace(/[$,]/g, ''));

  const rows = [...checklist.matchAll(
    /^\|\s*(Starter|Professional[^|]*|Firm)\s*\|\s*(\$[\d,]+)\s*\|\s*(\$[\d,]+)\s*\|\s*([\d,]+)\s*\|\s*(\$[\d.]+)\s*\|/gm
  )];
  assert.equal(rows.length, 3, 'could not parse the three plan rows out of CHECKLIST section 7');

  const src = read(BILLING);
  for (const [, nameRaw, monthly, annual, checks, overage] of rows) {
    const name = nameRaw.trim().replace(/\s*\(.*\)$/, '');
    const entry = new RegExp(
      `\\{\\s*name: '${name}',\\s*monthly: ${num(monthly)},\\s*annual: ${num(annual)},` +
        `\\s*includedChecks: ${num(checks)},\\s*overage: ${num(overage)}`
    );
    assert.match(
      src,
      entry,
      `${BILLING}: the ${name} plan row does not match CHECKLIST section 7 ` +
        `(expected ${monthly}/mo, ${annual}/yr, ${checks} cheques, ${overage} overage)`
    );
  }
  console.log('  ok  all three plan rows match CHECKLIST section 7 exactly');

  /* Nothing on this page may claim subscription state that has no source. */
  assert.match(
    src,
    /const PENDING_FIELDS = \[/,
    `${BILLING} dropped PENDING_FIELDS — the fields with no data source must stay visible, ` +
      'not be replaced with plausible values'
  );
  for (const field of ['Payment status', 'Paid-through date', 'Payment method']) {
    assert.ok(
      src.includes(`'${field}'`),
      `${BILLING} stopped declaring "${field}" as pending — if it now renders a value, where is it from?`
    );
  }
  /* The old page labelled closed months "Paid". There is no payment record. */
  assert.ok(
    !/'paid'|"paid"|>\s*Paid\s*</i.test(code(BILLING)),
    `${BILLING} reintroduced a "Paid" invoice status — there is no payment record behind it`
  );
  console.log('  ok  billing declares its unsourced fields and claims no payment state');
}

/* --- 6. The trial meter reads the real endpoint ------------------------- */

{
  const src = read(BILLING);
  assert.match(
    src,
    /'\/api\/usage\/trial-status'/,
    `${BILLING} no longer reads /api/usage/trial-status — trial figures must come from the same ` +
      'function the processing gate enforces, or the two drift'
  );
  /* The failure path is the LIKELY path: migration 029 is unapplied. A thrown
     fetch must not fall through to a zero that reads as "nothing used". */
  assert.match(
    src,
    /if \(!res\.ok\) \{\s*throw new Error\(/,
    `${BILLING} stopped throwing on a non-OK trial-status response — a 500 would render as 0 used`
  );
  assert.match(
    src,
    /setTrial\(null\);/,
    `${BILLING} no longer clears trial state on failure — stale or zero figures would show instead`
  );
  assert.match(
    src,
    /Usage state unavailable/,
    `${BILLING} lost the explicit "unavailable" state for a failed trial-status call`
  );
  console.log('  ok  trial meter wired to trial-status, and its failure renders as unavailable');
}

/* --- 7. Status colours are mapped, never invented ----------------------- */

{
  const src = read(MATCH_ROW);
  const block = src.match(/const MATCH_STATUS[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, `${MATCH_ROW}: MATCH_STATUS table not found`);

  const pills = [...block![1].matchAll(/pill:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(pills.length >= 6, `${MATCH_ROW}: expected a pill mapping for every match status`);

  for (const pill of pills) {
    assert.ok(
      pill in STATUS_TONES,
      `${MATCH_ROW} maps a status onto '${pill}', which is not a StatusPill key — ` +
        'StatusPill maps statuses once; do not invent status colours'
    );
  }

  /* `discrepancy` and `flagged` are not StatusPill keys. They must be present as
     SOURCE statuses (the engine emits them) and aliased, never added as tones. */
  for (const emitted of ['discrepancy', 'flagged']) {
    assert.match(
      block![1],
      new RegExp(`^\\s*${emitted}:`, 'm'),
      `${MATCH_ROW} dropped the '${emitted}' status the match engine emits`
    );
    assert.ok(
      !(emitted in STATUS_TONES),
      `STATUS_TONES gained a '${emitted}' key — if the primitive now maps it, drop the local alias ` +
        'rather than keeping two mappings'
    );
  }
  console.log('  ok  every match status maps onto an existing StatusPill key');
}

/* --- 8. The dynamic inline styles, and only those ----------------------- */

/**
 * MatchRow was one of the 17 inline-`style` files and the highest-risk one,
 * because it did dynamic maths rather than static colour. Exactly one inline
 * style survives and it is a percentage width, which no utility can express.
 * A second one appearing is how static colour creeps back in through `style`.
 */
{
  const src = read(MATCH_ROW);
  /* `[\s\S]*?` not `[^}]*`: the value itself contains `}` (a `${…}` template
     hole), so a negated-brace class stops short and silently finds nothing. */
  const styles = [...src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((m) => m[1].trim());
  assert.equal(
    styles.length,
    1,
    `${MATCH_ROW} has ${styles.length} inline style(s) ${JSON.stringify(styles)} — ` +
      'exactly one is allowed, the ScoreBar width, because the value is genuine maths'
  );
  assert.match(
    styles[0],
    /^width: `\$\{pct\}%`$/,
    `${MATCH_ROW}'s surviving inline style is no longer the ScoreBar width: ${styles[0]}`
  );
  // Colour, radius and shadow must never travel through `style`.
  assert.doesNotMatch(
    src,
    /style=\{\{[\s\S]*?(?:background|color|border|boxShadow|borderRadius)[\s\S]*?\}\}/,
    `${MATCH_ROW} passes colour/radius/shadow through an inline style — those are tokens`
  );
  console.log('  ok  MatchRow keeps exactly one inline style and it is the dynamic width');
}

/* --- 9. Primitives come through the barrel ------------------------------ */

for (const rel of OWNED) {
  const src = read(rel);
  if (!/<(?:GlassCard|GlassPanel|KpiTile|Button|IconButton|Dialog|Tabs|Badge|StatusPill|TableShell|Input|Select|Textarea|Skeleton)\b/.test(src)) continue;
  assert.match(
    src,
    /from '@\/components\/ui'/,
    `${rel} uses a primitive but not via the @/components/ui barrel`
  );
}
console.log('  ok  every primitive is imported from the barrel');

console.log('\nall parcel H checks passed');
