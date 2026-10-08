/**
 * Self-check for the upload flow (parcel C).
 *
 *   cd frontend && npx tsx scripts/check-upload-flow.ts
 *
 * No test framework on purpose. These are the four regressions that would
 * actually happen to these files, and none of them is loud:
 *
 *  1. A literal hex or a raw Tailwind palette colour (`bg-blue-600`,
 *     `text-gray-500`) comes back, so the surface stops being glass and
 *     silently drifts off the indigo primary.
 *  2. The dropzone loses one of its three drag states. Resting still looks
 *     right, so a review passes; accept and reject are only visible mid-drag.
 *  3. The extraction-method picker is reintroduced. Michael removed it on
 *     purpose — "the software should just extract the data they need".
 *  4. The analyze call goes straight at the Python backend again, or the
 *     trial/billing gate falls through to that unauthenticated path.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGE = 'app/(app)/upload/page.tsx';
const DROPZONE = 'app/(app)/upload/components/DropzoneUpload.tsx';

/** Everything parcel C owns. */
const OWNED = [
  PAGE,
  DROPZONE,
  'app/(app)/upload/components/UploadProgress.tsx',
  'app/(app)/upload/components/MultiFileQueue.tsx',
];

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/* --- 1. No hardcoded colour, and no raw palette colour ------------------- */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

// `bg-blue-600` was the de-facto primary at 23 call sites app-wide. Colour now
// comes from the token families (brand / ink / success / warning / error /
// info / neutral / glass / surface / shell), never from the raw palette.
const PALETTE = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|accent|shadow)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

for (const rel of OWNED) {
  const src = read(rel);

  const hexes = src.match(HEX);
  assert.equal(
    hexes,
    null,
    `${rel} has hardcoded colour(s) ${JSON.stringify(hexes)} — use a token from tailwind.config.js`
  );

  const palette = src.match(PALETTE);
  assert.equal(
    palette,
    null,
    `${rel} uses raw Tailwind palette colour(s) ${JSON.stringify(palette)} — use the token families`
  );
}
console.log(`  ok  ${OWNED.length} parcel-C files carry no hex and no raw palette colour`);

/* --- 2. Inline style stays dynamic-only --------------------------------- */
// Upload progress and the image viewers must keep width/transform inline —
// those are runtime numbers. Colour and radius inline is how a file drifts
// off the tokens without the build noticing.
const INLINE_STYLE = /style=\{\{([^}]*)\}\}/g;
const STYLE_ALLOWED = new Set(['width', 'transform', 'transformOrigin', 'maxWidth', 'maxHeight']);

for (const rel of OWNED) {
  for (const [, body] of read(rel).matchAll(INLINE_STYLE)) {
    for (const prop of body.matchAll(/([A-Za-z]+)\s*:/g)) {
      assert.ok(
        STYLE_ALLOWED.has(prop[1]),
        `${rel} sets \`${prop[1]}\` via inline style — only runtime geometry (${[...STYLE_ALLOWED].join(', ')}) may bypass Tailwind`
      );
    }
  }
}
console.log('  ok  inline style is limited to runtime geometry');

/* --- 3. The dropzone keeps all three drag states ------------------------ */
// Drag states come from hook booleans, not classNames. Glassifying only the
// resting state leaves accept and reject looking broken, and nobody sees them
// in review because they only exist while a pointer is mid-drag.
{
  const src = read(DROPZONE);

  // Not just "the identifier appears somewhere" — the resolved state must
  // actually be DERIVED from all three booleans. Dropping one from the
  // ternary while leaving its branch in the JSX makes that branch dead code,
  // which is precisely the regression that reads fine in a diff.
  const stateExpr = src.match(/const state =([^;]*);/)?.[1];
  assert.ok(stateExpr, `${DROPZONE} no longer resolves a single \`state\` from the hook booleans`);

  for (const hook of ['isDragActive', 'isDragAccept', 'isDragReject']) {
    assert.match(
      stateExpr!,
      new RegExp(`\\b${hook}\\b`),
      `${DROPZONE}: \`state\` is no longer derived from \`${hook}\` — that drag state is now unreachable`
    );
  }

  for (const state of ['resting', 'accept', 'reject']) {
    assert.match(
      src,
      new RegExp(`'${state}'`),
      `${DROPZONE} lost its '${state}' drag state branch`
    );
  }

  // Each state must paint something different, or two of the three are dead.
  const borders = [...src.matchAll(/\bborder-(brand|error|ink-strong\/20)\b/g)].map((m) => m[1]);
  assert.equal(
    new Set(borders).size,
    3,
    `${DROPZONE}: the three drag states no longer paint three distinct borders (found ${JSON.stringify(borders)})`
  );
}
console.log('  ok  dropzone handles resting / accept / reject distinctly');

/* --- 4. The extraction-method picker stays gone ------------------------- */
// Removed deliberately (Michael, 21 Sep). A restyling pass is exactly when
// someone "restores" the card they found commented out.
{
  const src = read(PAGE);

  assert.match(
    src,
    /const EXTRACTION_METHODS = \['ai'\] as const;/,
    `${PAGE}: EXTRACTION_METHODS is no longer the single-element constant — the engine is Kyriq's choice, not the user's`
  );

  for (const engine of ['tesseract', 'numarkdown', 'Extraction Method', 'setMethods', 'selectedMethods']) {
    assert.doesNotMatch(
      src,
      new RegExp(engine, 'i'),
      `${PAGE} mentions "${engine}" — the extraction-method picker must not come back`
    );
  }
}
console.log('  ok  no extraction-method picker');

/* --- 5. Analyze goes through the Next proxy, and the gate does not leak -- */
// The proxy carries the session, which is what resolves the tenant. A 402/401
// must throw ProcessingBlocked and must NOT fall through to the direct
// backend call, which is unauthenticated and would bypass billing entirely.
{
  const src = read(PAGE);

  assert.match(src, /fetch\('\/api\/upload-analyze'/, `${PAGE} no longer analyzes through the Next proxy`);
  assert.match(
    src,
    /confirm_reupload=true/,
    `${PAGE} lost the opt-in re-upload retry`
  );
  assert.match(
    src,
    /instanceof ProcessingBlocked \|\| \w+ instanceof DuplicateSkipped/,
    `${PAGE}: the catch no longer re-throws ProcessingBlocked/DuplicateSkipped — the billing gate now falls through to the direct backend call`
  );
  // The gate's message must reach the reader, not just the console.
  assert.match(src, /setBlocked\(/, `${PAGE} no longer surfaces ProcessingBlocked's message in the UI`);
}
console.log('  ok  analyze proxies through /api/upload-analyze and the gate is surfaced');

/* --- 6. The re-upload prompt is a Dialog, not window.confirm ------------ */
{
  const src = read(PAGE);
  assert.doesNotMatch(
    src,
    /window\.confirm\s*\(/,
    `${PAGE} went back to window.confirm — the re-upload prompt is a Dialog`
  );
  assert.match(src, /answerReupload\(false\)/, `${PAGE}: declining a re-upload no longer skips the file`);
  assert.match(src, /answerReupload\(true\)/, `${PAGE}: accepting a re-upload no longer retries`);
}
console.log('  ok  re-upload prompt is a Dialog with skip/retry wired');

console.log('\nall upload-flow checks passed');
