/**
 * Self-check for the app shells and navigation chrome (parcel B).
 *
 *   cd frontend && npx tsx scripts/check-shell-tokens.ts
 *
 * No test framework on purpose. The failure mode being guarded against is a
 * regression nobody notices in review: someone paints a shell surface with a
 * literal hex again (which makes the glass opaque, so it reads as grey and the
 * ambient mesh behind it disappears), or re-pins a sidebar to an arbitrary
 * pixel width so the aside and the main margin drift apart by a few pixels.
 *
 * Three hexes and two widths were removed to get here; this is what stops them
 * coming back.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every surface parcel B owns. */
const OWNED = [
  'app/layout.tsx',
  'app/not-found.tsx',
  'app/qb-oauth-complete/page.tsx',
  'app/(app)/layout.tsx',
  'app/(admin)/layout.tsx',
  'app/(auth)/layout.tsx',
  'components/CompanySwitcher.tsx',
  'components/SidebarCompanySwitcher.tsx',
  'components/AccountSwitcher.tsx',
  'components/UserProfile.tsx',
  'components/SuperAdminLink.tsx',
  'components/LogoutButton.tsx',
];

/** Both shells, which must agree on one width token. */
const SHELLS = ['app/(app)/layout.tsx', 'app/(admin)/layout.tsx'];

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/* --- No hardcoded colour anywhere in parcel B ---------------------------- */
// Deliberately matches `#abc`, `#aabbcc` and `#aabbccdd` in any context —
// className, inline style or raw CSS. Colour belongs to the token file.
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

for (const rel of OWNED) {
  const found = read(rel).match(HEX);
  assert.equal(
    found,
    null,
    `${rel} has hardcoded colour(s) ${JSON.stringify(found)} — use a token from tailwind.config.js`
  );
}
console.log(`  ok  ${OWNED.length} parcel-B files carry no hardcoded hex`);

/* --- One sidebar width, expressed as a spacing token -------------------- */
// The two shells used to be 220px and 240px. They are now one token, and the
// aside width must equal the main offset or content sits under the chrome.
const ARBITRARY_WIDTH = /\b(?:w|min-w|max-w|ml|mr|left|right|inset|basis)-\[[^\]]*(?:px|rem|em|%)\]/g;

for (const rel of SHELLS) {
  const src = read(rel);
  const bad = src.match(ARBITRARY_WIDTH);
  assert.equal(
    bad,
    null,
    `${rel} re-introduced a fixed layout width ${JSON.stringify(bad)} — use the spacing scale`
  );
  assert.match(src, /\bw-60\b/, `${rel} lost the shared shell width token (w-60)`);
  assert.match(src, /\bmd:ml-60\b/, `${rel} main offset no longer matches the shell width`);
}
console.log('  ok  both shells share one spacing-token width (w-60 / md:ml-60)');

/* --- The shells stay transparent over the ambient mesh ------------------- */
// Glass over a flat page reads as a rendering bug, so a shell must not paint
// an opaque background of its own.
for (const rel of SHELLS) {
  const src = read(rel);
  assert.match(src, /\bglass-shell\b/, `${rel} is no longer the dark glass shell`);
  assert.doesNotMatch(
    src,
    /className="min-h-screen[^"]*\bbg-/,
    `${rel} paints its own page background — it must be transparent over the mesh`
  );
}
console.log('  ok  both shells are glass-shell and transparent over the mesh');

/* --- One scrollbar per page --------------------------------------------- */
// The shell must not wrap already-scrolling content in a second scroll box.
for (const rel of SHELLS) {
  assert.doesNotMatch(
    read(rel),
    /<main[^>]*\boverflow-(?:auto|y-auto|scroll)\b/,
    `${rel} <main> became a scroll container — that is the second scrollbar`
  );
}
console.log('  ok  neither shell wraps content in a second scroll container');

console.log('\nall shell checks passed');
