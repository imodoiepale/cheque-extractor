/**
 * Self-check for the premium-glass foundation (parcel A).
 *
 *   cd frontend && npx tsx scripts/check-primitives.ts
 *
 * No test framework on purpose. This is the smallest thing that fails if the
 * cva variant maps collapse — the failure mode being guarded against is a
 * variant silently resolving to the base class string, so every Button looks
 * identical and nobody notices until review.
 *
 * It also guards the hard requirement that the Magic-UI keyframes and their
 * CSS variables survive verbatim in tailwind.config.js. Four decorative
 * components depend on them and they break silently, not loudly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buttonVariants } from '../components/ui/button';
import { glassCardVariants, glassPanelVariants } from '../components/ui/glass-card';
import { badgeVariants } from '../components/ui/badge';
import { tdVariants, thVariants } from '../components/ui/table';

const require = createRequire(import.meta.url);

/** Every variant must produce a non-empty string, and no two may collide. */
function assertDistinct(label: string, outputs: Record<string, string>) {
  const seen = new Map<string, string>();
  for (const [key, cls] of Object.entries(outputs)) {
    assert.ok(cls.trim().length > 0, `${label}.${key} produced an empty class string`);
    const clash = seen.get(cls);
    assert.ok(
      clash === undefined,
      `${label}.${key} is identical to ${label}.${clash} — the variant map is not being applied`
    );
    seen.set(cls, key);
  }
  assert.equal(
    seen.size,
    Object.keys(outputs).length,
    `${label}: expected ${Object.keys(outputs).length} distinct outputs, got ${seen.size}`
  );
  console.log(`  ok  ${label}: ${seen.size} distinct variants`);
}

/* --- Button: every variant, and every size ------------------------------- */

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'destructive', 'link'] as const;
const BUTTON_SIZES = ['sm', 'md', 'lg', 'icon', 'icon-sm'] as const;

assertDistinct(
  'buttonVariants.variant',
  Object.fromEntries(BUTTON_VARIANTS.map((v) => [v, buttonVariants({ variant: v })]))
);
assertDistinct(
  'buttonVariants.size',
  Object.fromEntries(BUTTON_SIZES.map((s) => [s, buttonVariants({ size: s })]))
);

// Buttons are pills with a 3rem floor at the default size (DESIGN-SYSTEM 5.1).
const defaultButton = buttonVariants({});
assert.match(defaultButton, /\brounded-full\b/, 'Button lost its pill radius');
assert.match(defaultButton, /\bmin-h-btn\b/, 'Button lost its 3rem min-height');
assert.match(defaultButton, /\bgap-2\b/, 'Button lost its 0.5rem gap');
assert.match(defaultButton, /\bduration-tap\b/, 'Button press is no longer on the 120ms tap token');
assert.match(defaultButton, /\bdisabled:opacity-disabled\b/, 'Button lost the 0.45 disabled token');
assert.match(
  defaultButton,
  /\benabled:active:scale-press\b/,
  'Button lost the scale(0.96) press state'
);
// Never `transition-all`: it animates backdrop-filter and tanks frame rate.
assert.doesNotMatch(defaultButton, /\btransition-all\b/, 'Button must enumerate transition-property');
console.log('  ok  Button pill / motion / disabled tokens present');

/* --- GlassCard: one blur tier per depth ---------------------------------- */

const GLASS_TIERS = ['card', 'bright', 'modal', 'chrome', 'toast', 'shell', 'panel'] as const;

assertDistinct(
  'glassCardVariants.tier',
  Object.fromEntries(GLASS_TIERS.map((t) => [t, glassCardVariants({ tier: t })]))
);

// The tier classes are what carry backdrop-filter plus the two fallbacks.
for (const tier of GLASS_TIERS) {
  const cls = glassCardVariants({ tier });
  assert.match(
    cls,
    /glass-(card|modal|chrome|toast|shell|panel)/,
    `GlassCard tier "${tier}" is not attached to a glass surface class`
  );
}
// Selected must change background/shadow only — never the border WIDTH, or
// selecting a row reflows the text inside it.
const selected = glassCardVariants({ tier: 'card', selected: true });
assert.match(selected, /\bglass-selected\b/, 'GlassCard lost its selected recipe');
assert.doesNotMatch(selected, /\bborder-2\b/, 'Selected state must not change border width');
console.log('  ok  GlassCard tiers attached to glass surfaces; selected keeps 1px border');

assertDistinct(
  'glassPanelVariants.tone',
  Object.fromEntries(
    (['neutral', 'sunken', 'plain'] as const).map((t) => [t, glassPanelVariants({ tone: t })])
  )
);

/* --- State colours: each tone distinct, each pairing its own -text ------- */

const BADGE_TONES = ['neutral', 'brand', 'success', 'warning', 'error', 'outline', 'solid'] as const;
assertDistinct(
  'badgeVariants.tone',
  Object.fromEntries(BADGE_TONES.map((t) => [t, badgeVariants({ tone: t })]))
);
for (const tone of ['success', 'warning', 'error'] as const) {
  const cls = badgeVariants({ tone });
  assert.match(cls, new RegExp(`bg-${tone}-bg\\b`), `Badge "${tone}" lost its bg token`);
  assert.match(cls, new RegExp(`text-${tone}-text\\b`), `Badge "${tone}" lost its 4.5:1 text token`);
}
console.log('  ok  state badges pair -bg with their contrast-verified -text');

/* --- Table: density must not regress ------------------------------------- */

assert.match(tdVariants({}), /\bpy-3\b/, 'Table row height changed — density must not regress');
assert.match(tdVariants({ numeric: true }), /\bnums\b/, 'Numeric cells lost tabular-nums');
assert.match(tdVariants({ numeric: true }), /\btext-right\b/, 'Numeric cells must be right-aligned');
assert.match(thVariants({ numeric: true }), /\bnums\b/, 'Numeric headers lost tabular-nums');
assertDistinct('thVariants.numeric', {
  numeric: thVariants({ numeric: true }),
  text: thVariants({ numeric: false }),
});
console.log('  ok  table row height, tabular-nums and alignment intact');

/* --- Tailwind theme: preserved Magic-UI contract ------------------------- */

type TailwindTheme = {
  theme?: { extend?: { keyframes?: Record<string, unknown>; animation?: Record<string, string> } };
};
const config = require('../tailwind.config.js') as TailwindTheme;
const keyframes = config.theme?.extend?.keyframes ?? {};
const animation = config.theme?.extend?.animation ?? {};

for (const name of ['marquee', 'marquee-vertical', 'border-beam', 'shimmer-slide', 'spin-around']) {
  assert.ok(keyframes[name], `PRESERVED keyframe "${name}" is missing — breaks a Magic-UI component`);
  assert.ok(animation[name], `PRESERVED animation "${name}" is missing`);
}
assert.match(animation['marquee'], /var\(--duration\)/, 'marquee lost --duration');
assert.match(animation['border-beam'], /var\(--duration\)/, 'border-beam lost --duration');
assert.match(animation['shimmer-slide'], /var\(--speed\)/, 'shimmer-slide lost --speed');
assert.match(animation['spin-around'], /var\(--speed\)/, 'spin-around lost --speed');
assert.match(
  String((keyframes['marquee'] as Record<string, Record<string, string>>).to.transform),
  /var\(--gap\)/,
  'marquee keyframe lost --gap'
);
console.log('  ok  Magic-UI keyframes + --duration / --speed / --gap preserved');

/* --- Every :root token has a Tailwind theme entry ------------------------ */
// This is the bug that made the old @apply block inert: variables existed in
// :root but were never mapped, so the utilities simply did not exist.

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
for (const utility of [
  'from-primary',
  'to-primary-dark',
  'bg-success-bg',
  'text-success-text',
  'bg-error-bg',
  'text-error-text',
  'bg-warning-bg',
  'text-warning-text',
  'bg-info-bg',
  'text-info-text',
  'border-success-border',
  'border-warning-border',
  'border-error-border',
]) {
  assert.ok(css.includes(utility), `globals.css no longer @applies ${utility}`);
}
for (const cssVar of [
  '--glass-card-bg',
  '--glass-fallback-bg',
  '--glass-opaque-bg',
  '--ease-settle',
  '--dur-tap',
  '--dur-quick',
  '--dur-settle',
  '--dur-reveal',
  '--radius-input',
  '--radius-btn',
  '--radius-pill',
  '--radius-card',
]) {
  assert.ok(css.includes(cssVar), `token ${cssVar} is missing from globals.css`);
}
// The three-tier degradation must survive: blur is never guaranteed.
assert.ok(
  css.includes('@supports not ((backdrop-filter: blur(1px))'),
  'the @supports blur fallback was removed'
);
assert.ok(
  css.includes('prefers-reduced-transparency'),
  'the reduced-transparency fallback was removed'
);
assert.ok(css.includes('prefers-reduced-motion'), 'the reduced-motion block was removed');
console.log('  ok  glass fallbacks, motion tokens and state utilities all present');

console.log('\nall primitive checks passed');
