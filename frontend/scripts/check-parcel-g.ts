/**
 * Self-check for the admin surfaces, firm dashboard, reconciliation and all
 * four Recharts files (parcel G).
 *
 *   cd frontend && npx tsx scripts/check-parcel-g.ts
 *
 * No test framework on purpose. The regressions guarded here are the ones
 * that pass review and a green build and are still wrong in a browser:
 *
 *   1. A chart colour is written at a call site instead of in the palette
 *      module. Recharts colours are JS props, so a token swap never reaches
 *      them — that is exactly how four files ended up with four blues.
 *   2. A `ResponsiveContainer` is mounted without an explicit height. Inside
 *      a glass card (backdrop-filter + overflow-hidden) it measures 0 and the
 *      chart renders as nothing at all. Invisible in source, invisible in a
 *      build, only visible in a browser.
 *   3. `areaFade` / `pieLabel` get turned back into components. Recharts
 *      walks its own children and drops anything it does not recognise, so
 *      `<AreaFade />` silently never registers its gradient and every area
 *      renders as a bare stroke. This one actually happened.
 *   4. The retired Analytics route comes back, or its metrics quietly fall
 *      out of Firm Admin on the way.
 *   5. A table's row height drifts, costing an accountant rows on screen.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const has = (rel: string) => existsSync(path.join(root, rel));

const PALETTE = 'lib/charts.tsx';

/** The four files that render Recharts. Nothing else may import recharts. */
const CHART_FILES = [
  'app/(admin)/admin/page.tsx',
  'app/(admin)/admin/revenue/page.tsx',
  'app/(admin)/admin/tenants/[id]/page.tsx',
  'app/(app)/firm-dashboard/page.tsx',
];

const OWNED = [
  'app/(admin)/layout.tsx',
  'app/(admin)/admin/page.tsx',
  'app/(admin)/admin/firms/page.tsx',
  'app/(admin)/admin/revenue/page.tsx',
  'app/(admin)/admin/tenants/page.tsx',
  'app/(admin)/admin/tenants/[id]/page.tsx',
  'app/(admin)/admin/users/page.tsx',
  'app/(app)/firm-dashboard/page.tsx',
  'app/(app)/reconciliation/page.tsx',
  'app/(app)/super-admin/page.tsx',
];

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
const RAW_PALETTE =
  /\b(?:bg|text|border|from|to|via|ring|divide|fill|stroke|placeholder|decoration|outline|shadow|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

/* --- 1. Colour lives in tokens, and chart colour lives in ONE module ---- */
for (const rel of OWNED) {
  const src = read(rel);
  const hexes = src.match(HEX);
  assert.equal(
    hexes,
    null,
    `${rel} has hardcoded colour(s) ${JSON.stringify(hexes)} — use a token, or lib/charts.tsx for a chart colour`
  );
  const raw = src.match(RAW_PALETTE);
  assert.equal(
    raw,
    null,
    `${rel} still uses a raw Tailwind palette utility (${raw?.[0]}) — the palette is the token families`
  );
}
console.log(`  ok  ${OWNED.length} parcel-G files carry no hex and no raw palette utility`);

/* --- 2. The palette module is the only place a chart colour exists ------ */
// Recharts takes colour as a JS prop, so `--brand` changing in globals.css
// reaches every className in the app and not one chart. One module, four
// importers, or the charts drift off the surfaces again.
{
  const palette = read(PALETTE);
  for (const name of ['CHART_COLORS', 'CHART_SERIES', 'PLAN_CHART_COLORS', 'CHECK_STATUS_COLORS']) {
    assert.match(palette, new RegExp(`export const ${name}\\b`), `${PALETTE} no longer exports ${name}`);
  }
  // Each literal must be annotated with the token it mirrors, or the next
  // person has no way to tell which ones are still in sync.
  const brandish = (palette.match(HEX) ?? []).length;
  assert.ok(brandish >= 10, `${PALETTE} lost its colour literals (${brandish} found)`);
  assert.match(palette, /not finished colours|hsl components|hsl\(/i,
    `${PALETTE} lost the note explaining why the values are literals and not var(--token)`);
}

for (const rel of CHART_FILES) {
  const src = read(rel);
  assert.match(src, /from '@\/lib\/charts'/, `${rel} does not import the shared chart palette`);

  // No colour prop may be written at a call site.
  for (const prop of ['stroke', 'fill', 'stopColor', 'color']) {
    const bad = src.match(new RegExp(`${prop}=["']#[0-9a-fA-F]{3,8}["']`, 'g'));
    assert.equal(bad, null, `${rel} hardcodes a chart colour ${JSON.stringify(bad)} — it belongs in ${PALETTE}`);
  }
  // Nor may a file roll its own tooltip / axis chrome.
  assert.doesNotMatch(src, /contentStyle=\{\{/, `${rel} declares its own tooltip style — use TOOLTIP_PROPS`);
  assert.doesNotMatch(src, /tick=\{\{\s*fill/, `${rel} declares its own axis tick style — use AXIS_TICK`);
  assert.doesNotMatch(
    src,
    /<CartesianGrid(?![^>]*\{\.\.\.GRID_PROPS\})/,
    `${rel} has a CartesianGrid that does not spread GRID_PROPS — gridlines must be one value app-wide`
  );
}
console.log(`  ok  all ${CHART_FILES.length} chart files take every colour from ${PALETTE}`);

/* --- 3. No chart may be mounted without an explicit height -------------- */
// ResponsiveContainer measures its parent. In a glass card (backdrop-filter +
// overflow-hidden) a parent with no resolved height measures 0 and the chart
// is simply not there. ChartFrame declares the height, so the rule is that
// nothing outside the palette module may touch ResponsiveContainer at all.
{
  const palette = read(PALETTE);
  assert.match(
    palette,
    /style=\{\{\s*height\s*\}\}/,
    'ChartFrame no longer sets an explicit height — that is the collapsed-chart bug'
  );
  assert.match(
    palette,
    /<ResponsiveContainer width="100%" height="100%">/,
    'ChartFrame no longer fills its sized wrapper'
  );

  for (const rel of CHART_FILES) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /ResponsiveContainer/,
      `${rel} mounts ResponsiveContainer directly — go through ChartFrame, which guarantees the height`
    );
    const frames = (src.match(/<ChartFrame\b/g) ?? []).length;
    const charts = (src.match(/<(?:Area|Bar|Line|Pie|Composed)Chart\b/g) ?? []).length;
    assert.equal(
      frames,
      charts,
      `${rel} has ${charts} charts but ${frames} ChartFrames — every chart needs its own sized frame`
    );
    // And every frame must name a height rather than relying on the default.
    const unsized = (src.match(/<ChartFrame(?![^>]*height=)/g) ?? []).length;
    assert.equal(unsized, 0, `${rel} has ${unsized} ChartFrame(s) with no explicit height`);
  }
}
console.log('  ok  every chart sits in a ChartFrame with an explicit height');

/* --- 4. areaFade / pieLabel stay plain functions ------------------------ */
// Recharts filters its children to the element types it knows, so a custom
// component wrapping <defs> is dropped and the gradient never exists —
// `fill="url(#id)"` then resolves to nothing and the area is a bare stroke.
// Calling the function inlines the real <defs> element instead.
{
  const palette = read(PALETTE);
  assert.match(palette, /export function areaFade\(id: string, color: string\)/,
    'areaFade must stay a plain function — as a component Recharts drops its <defs>');
  assert.doesNotMatch(palette, /export function AreaFade/,
    'areaFade was turned back into a component; its gradient will silently not render');

  for (const rel of CHART_FILES) {
    const src = read(rel);
    assert.doesNotMatch(src, /<AreaFade\b/, `${rel} renders <AreaFade /> — call {areaFade(id, color)} instead`);
    // Every url(#id) fill must have a matching areaFade() call on the page.
    for (const m of src.matchAll(/fill="url\(#([^)]+)\)"/g)) {
      assert.ok(
        src.includes(`areaFade('${m[1]}'`),
        `${rel} fills with url(#${m[1]}) but never defines that gradient`
      );
    }
  }
}
console.log('  ok  area gradients are defined by a call, not by a dropped component');

/* --- 5. Chart text stays legible on the glass --------------------------- */
// Recharts' default pie label inherits the SLICE's fill. Amber on a white
// card is 2.1:1. The label must take ink-body instead.
{
  const palette = read(PALETTE);
  assert.match(palette, /export function pieLabel\(/, `${PALETTE} lost the accessible pie label renderer`);
  assert.match(palette, /fill=\{CHART_COLORS\.inkBody\}/, 'the pie label no longer uses ink-body');
  assert.match(palette, /AXIS_TICK[\s\S]{0,80}inkFaint/, 'axis ticks no longer use ink-faint');
  // Gridlines: present but quiet. The hairline token vanishes behind a
  // 0.72-alpha surface; a solid grey shouts over it.
  assert.match(
    palette,
    /GRID_STROKE = 'rgba\(15, 23, 42, 0\.10\)'/,
    'the gridline value moved — it is tuned to stay visible on glass without competing'
  );
  for (const rel of CHART_FILES) {
    assert.doesNotMatch(
      read(rel),
      /label=\{\(\{ name, percent \}\)/,
      `${rel} went back to the default pie label, which inherits the slice colour and fails contrast`
    );
  }
}
console.log('  ok  axis, grid and pie-label contrast comes from the palette module');

/* --- 6. Series carry no JS tween ---------------------------------------- */
// Pie suppresses its labels entirely until the tween finishes, the tween is
// rAF-driven so it freezes part-drawn when the tab is not painting, and it
// restarts on every filter change. DESIGN-SYSTEM 4.4: entrances are CSS.
for (const rel of CHART_FILES) {
  const src = read(rel);
  const series = (src.match(/<(?:Area|Bar|Line|Pie)\s/g) ?? []).length;
  const tweenless = (src.match(/<(?:Area|Bar|Line|Pie) \{\.\.\.NO_TWEEN\}/g) ?? []).length;
  assert.equal(
    series,
    tweenless,
    `${rel} has ${series} series but ${tweenless} carrying NO_TWEEN — a JS tween hides pie labels and restarts on every filter change`
  );
}
console.log('  ok  no series runs Recharts’ JS entrance tween');

/* --- 7. The Analytics route is gone, and its content is not ------------- */
// CHECKLIST section 3, item 10: "Remove the Analytics page; its content moves
// into Firm Admin." A move, not a cull — so the route must be gone AND the
// figures must be present in Firm Admin.
{
  assert.ok(!has('app/(app)/analytics'), 'the standalone /analytics route is back');
  assert.doesNotMatch(
    read('app/(app)/layout.tsx'),
    /['"]\/analytics['"]/,
    'the app shell still links to /analytics'
  );
  for (const rel of OWNED) {
    assert.doesNotMatch(read(rel), /href="\/analytics"/, `${rel} still links to the removed /analytics route`);
  }

  const firm = read('app/(app)/firm-dashboard/page.tsx');
  // The figures that page computed, each one by name.
  for (const [label, probe] of [
    ['document count', /label="Documents"/],
    ['pages scanned', /pages scanned/],
    ['extraction success rate', /% success rate/],
    ['per-engine breakdown', /Extraction Methods/],
    ['job status split', /Job Status/],
    ['per-document extraction', /Extracted/],
  ] as const) {
    assert.match(firm, probe, `Firm Admin lost the ${label} that moved over from Analytics`);
  }
  // The per-document list was folded into Client Overview, so that table must
  // still cover at least the 15 documents the Analytics list showed.
  const slice = firm.match(/completedJobs\.slice\(0, (\d+)\)/)?.[1];
  assert.ok(
    slice && Number(slice) >= 15,
    `Client Overview shows only ${slice} documents — the Analytics list showed 15`
  );
}
console.log('  ok  /analytics is gone and every one of its metrics is in Firm Admin');

/* --- 8. Density does not regress ---------------------------------------- */
// Two tables here are denser than the shared `tdVariants` recipe. Each
// declares its metrics ONCE, locally, the way parcel E's DENSE_GRID does —
// and neither may be "fixed" by editing the primitive instead.
{
  const recon = read('app/(app)/reconciliation/page.tsx');
  assert.match(
    recon,
    /const DENSE_RECON = '\[&_td\]:px-3 \[&_td\]:py-2\.5 \[&_th\]:px-3'/,
    'the reconciliation grid lost its py-2.5 density — that is ~40px rows, not the primitive’s 44px'
  );
  assert.equal(
    (recon.match(/\[&_td\]:py-/g) ?? []).length,
    1,
    'reconciliation row height is declared more than once — it belongs only in DENSE_RECON'
  );
  assert.match(recon, /<Table className=\{DENSE_RECON\}>/, 'the reconciliation table stopped applying DENSE_RECON');

  const tenant = read('app/(admin)/admin/tenants/[id]/page.tsx');
  assert.match(
    tenant,
    /const DENSE_LOG = '\[&_td\]:py-2\.5'/,
    'the QB entries log lost its py-2.5 density'
  );
  assert.equal(
    (tenant.match(/\[&_td\]:py-/g) ?? []).length,
    1,
    'the QB log row height is declared more than once — it belongs only in DENSE_LOG'
  );

  // The shared primitive is parcel A's. Parcel G must not have edited it.
  assert.match(
    read('components/ui/table.tsx'),
    /cva\('border-b border-glass-hairline px-4 py-3 text-ink-strong'/,
    'components/ui/table.tsx tdVariants changed — parcel G must not edit the primitive'
  );
}
console.log('  ok  two local densities, declared once each, primitive untouched');

/* --- 9. Money keeps tabular figures ------------------------------------- */
// Columns of amounts that do not line up are a correctness problem in a
// reconciliation product, not a cosmetic one.
for (const rel of OWNED) {
  const src = read(rel);
  for (const line of src.split('\n')) {
    if (!/\$\{[^}]*(?:mrr|amount|arr|revenue|Mrr)/i.test(line)) continue;
    if (!/<Td|<div|<span|<p\b/.test(line)) continue;
    assert.match(
      line,
      /nums/,
      `${rel} renders a money figure without tabular digits:\n    ${line.trim()}`
    );
  }
}
console.log('  ok  every money figure carries tabular digits');

/* --- 10. Glass never stacks, and never lands on a row ------------------- */
// Rule 2: never nest two blurred surfaces. Rule 7 / 2.5: glass goes on
// containers and headers, never on individual rows.
for (const rel of OWNED) {
  const src = read(rel);
  assert.doesNotMatch(
    src,
    new RegExp('<Tr[^>\\n]*className="[^"\\n]*glass-(?:card|modal|chrome|toast|shell)'),
    `${rel} puts a blurred surface on a table row — that is one compositing layer per row`
  );
  assert.doesNotMatch(
    src,
    new RegExp('<GlassCard[^>\\n]*>\\s*<GlassCard\\b'),
    `${rel} nests two glass cards — use GlassPanel for the inner group`
  );
}
console.log('  ok  no blurred row, no nested glass');

console.log('\nall parcel-G checks passed');
