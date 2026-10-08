/**
 * Self-check for the dashboard / process / review surfaces (parcel F).
 *
 *   cd frontend && npx tsx scripts/check-parcel-f.ts
 *
 * No test framework on purpose. These are the four regressions that would
 * actually ship unnoticed in a styling review:
 *
 *  1. A literal hex or a raw Tailwind palette colour comes back, so the page
 *     stops tracking the token file and drifts from every other surface.
 *  2. The Extraction Engines / Live Progress panels, or the Extraction Method
 *     picker, get "restored" — all three were removed on Michael's 21 Sep
 *     instruction and a well-meaning agent would put them back.
 *  3. Glass lands on a table row. backdrop-filter is a compositing layer per
 *     element, and these pages render the 428-cheque batch.
 *  4. Row height moves. The premium look costs no rows on screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tdVariants } from '../components/ui/table';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/**
 * Comments are stripped before the "did this come back?" checks run. The
 * comments in these files NAME the removed panels in order to explain why they
 * are absent, and a check that cannot tell a warning from a regression gets
 * deleted by the first person it blocks.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const DASHBOARD = 'app/(app)/dashboard/page.tsx';
const PROCESS = 'app/(app)/process/[id]/page.tsx';
const CONFIGURE = 'app/(app)/dashboard/components/ConfigureExtractionDialog.tsx';
const CHEQUE_DIALOG = 'app/(app)/dashboard/components/ChequeDialog.tsx';

/** Every file parcel F owns. */
const OWNED = [
  DASHBOARD,
  'app/(app)/dashboard/layout.tsx',
  'app/(app)/dashboard/loading.tsx',
  CHEQUE_DIALOG,
  CONFIGURE,
  'app/(app)/dashboard/components/DocumentSidebar.tsx',
  PROCESS,
  'app/(app)/review/[id]/page.tsx',
  'app/(app)/review/[id]/components/ApprovalActions.tsx',
  'app/(app)/review/[id]/components/AuditHistory.tsx',
  'app/(app)/review/[id]/components/CheckImageViewer.tsx',
  'app/(app)/review/[id]/components/ComparisonPanel.tsx',
  'app/(app)/review/[id]/components/ConfidenceBadge.tsx',
  'app/(app)/review/[id]/components/FieldEditor.tsx',
  'app/(app)/review/[id]/components/ValidationWarnings.tsx',
];

/* --- 1. Colour belongs to the token file -------------------------------- */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

/**
 * Raw Tailwind palette utilities. `blue-600` was the de-facto primary at 23
 * sites app-wide and is now `--primary` (Indigo #6366f1); the greys and the
 * state families all have `ink-*` / `success-*` / `warning-*` / `error-*`
 * tokens. Matching the palette NAME rather than a list of utilities catches
 * `ring-blue-500` and `divide-gray-100` as well as `bg-blue-600`.
 */
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
console.log(`  ok  ${OWNED.length} parcel-F files: no hex, no raw palette colour`);

/* --- 2. Removed panels and the removed method picker stay removed -------- */

{
  const src = code(PROCESS);
  // The two panels Michael had removed on 21 Sep, plus the state they needed.
  for (const gone of ['Extraction Engines', 'Live Progress', 'progressLogs', 'logsEndRef', 'methodBarColor']) {
    assert.ok(
      !src.includes(gone),
      `${PROCESS} reintroduced "${gone}" — the Engines and Live Progress panels were removed deliberately`
    );
  }
  // `Terminal` was the icon those panels used; it must not come back either.
  assert.doesNotMatch(
    src,
    /\bTerminal\b/,
    `${PROCESS} re-imported the Terminal icon — that belonged to the removed Live Progress panel`
  );
  // The post-completion summary IS deliberately kept.
  assert.ok(
    src.includes('Extraction Method Results'),
    `${PROCESS} lost the post-completion "Extraction Method Results" summary, which is deliberately kept`
  );
  console.log('  ok  process page: Engines / Live Progress still gone, method summary still present');
}

{
  const src = code(CONFIGURE);
  // The engine is a module constant and the user is never asked.
  assert.match(
    src,
    /^const EXTRACTION_METHOD = /m,
    `${CONFIGURE} no longer pins the engine as a module constant`
  );
  // A radio/checkbox group named for the method is exactly what was removed.
  assert.doesNotMatch(
    src,
    /name=["'](?:method|methods|extractionMethod)["']/,
    `${CONFIGURE} reintroduced an Extraction Method picker — Michael, 21 Sep: no OCR/image/confidence settings`
  );
  for (const gone of ['Extraction Method', 'tesseract', 'numarkdown', 'hybrid']) {
    assert.ok(
      !src.includes(gone),
      `${CONFIGURE} reintroduced engine choice ("${gone}") — the engine is not a user setting`
    );
  }
  console.log('  ok  configure dialog: engine is a constant, no method picker');
}

/* --- 3. Glass goes on containers and headers, never on rows -------------- */
// A blurred row means one compositing layer per row. The sticky <Thead> is the
// single sanctioned exception and it lives in the primitive, not here.

const BLUR_TIERS = /glass-(?:card|modal|chrome|toast|shell|surface)\b/g;
const ROW_WITH_GLASS = /<(?:Tr|tr)\b[^>]*glass-/g;

for (const rel of OWNED) {
  const src = code(rel);
  const bad = src.match(ROW_WITH_GLASS);
  assert.equal(bad, null, `${rel} puts a glass surface on a table row: ${JSON.stringify(bad)}`);
  // Nobody outside components/ui may hand-roll a glass tier onto a <Td>/<td>.
  assert.doesNotMatch(
    src,
    /<(?:Td|td)\b[^>]*glass-(?:card|modal|chrome|toast|shell)/,
    `${rel} puts a blurred surface on a table cell`
  );
}
console.log('  ok  no glass tier on any table row or cell');

/**
 * Blur budget per page. These counts are CONSTANT — they do not scale with
 * cheque count, because every per-row and per-tile surface is a GlassPanel
 * (no backdrop-filter) rather than a GlassCard. If a blurred surface is moved
 * inside a `.map()` this number goes up and this assertion is what catches it.
 */
const BLUR_BUDGET: Record<string, number> = {
  [DASHBOARD]: 0,          // all glass comes from GlassCard / KpiTile / TableShell
  [PROCESS]: 1,            // the export-format popover
  [CHEQUE_DIALOG]: 1,      // the export-format popover
};

for (const [rel, budget] of Object.entries(BLUR_BUDGET)) {
  const found = code(rel).match(BLUR_TIERS) ?? [];
  assert.equal(
    found.length,
    budget,
    `${rel} declares ${found.length} raw blur-tier classes, budget is ${budget} — ` +
      'a blurred surface inside a row/tile loop costs one compositing layer per row'
  );
}

// The per-cheque tiles must stay GlassPanel (no blur of its own).
for (const rel of [PROCESS]) {
  const src = code(rel);
  const mapBodies = src.split(/checks\.map\(/).slice(1);
  assert.ok(mapBodies.length > 0, `${rel}: no checks.map() found — did the list rendering move?`);
  for (const body of mapBodies) {
    const scope = body.slice(0, 2000);
    assert.ok(
      !/<GlassCard\b/.test(scope),
      `${rel} renders a GlassCard inside checks.map() — use GlassPanel, which carries no blur`
    );
  }
}
console.log('  ok  blur budget constant per page; per-cheque tiles carry no blur');

/* --- 4. Density does not regress ---------------------------------------- */

// The primitive still sets row height in exactly one place.
assert.match(
  tdVariants({}),
  /\bpy-3\b/,
  'the Td primitive lost py-3 — row height is set there and nowhere else'
);

// The two DENSE tables (text-xs lists) keep their pre-redesign py-1.5, and
// declare it once per file rather than per cell.
for (const rel of [DASHBOARD, CHEQUE_DIALOG]) {
  const src = read(rel);
  assert.match(
    src,
    /^const DENSE_CELL = 'px-2 py-1\.5';$/m,
    `${rel} changed or scattered the dense row height — it must stay py-1.5, declared once`
  );
  // Nobody may pad a dense cell back up to the default.
  assert.doesNotMatch(
    src,
    /\$\{DENSE_CELL\}[^`"']*\bpy-(?:2|2\.5|3|4)\b/,
    `${rel} overrides the dense row height back up — density must not regress`
  );
}

// Money and numeric columns stay tabular. A reconciliation product cannot
// have columns of figures that do not align.
for (const rel of [DASHBOARD, PROCESS, CHEQUE_DIALOG]) {
  assert.match(read(rel), /\bnums-money\b/, `${rel} lost the .nums-money amount column`);
}
console.log('  ok  row heights unchanged; amount columns still tabular');

/* --- 5. The primitives are the only source of these surfaces ------------- */
// An agent that needs a primitive changed reports back rather than editing it,
// so every parcel-F surface must come through the barrel.

for (const rel of OWNED) {
  const src = read(rel);
  if (!/<(?:GlassCard|GlassPanel|KpiTile|Button|IconButton|Dialog|Tabs|Badge|StatusPill|TableShell|Input)\b/.test(src)) continue;
  assert.match(
    src,
    /from '@\/components\/ui'/,
    `${rel} uses a primitive but not via the @/components/ui barrel`
  );
}
console.log('  ok  every primitive is imported from the barrel');

console.log('\nall parcel F checks passed');
