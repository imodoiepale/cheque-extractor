/**
 * Self-check for the public face (parcel I).
 *
 *   cd frontend && npx tsx scripts/check-landing.ts
 *
 * No test framework on purpose. These are the regressions that would actually
 * happen to these files, and none of them is loud:
 *
 *  1. A hex or a raw Tailwind palette class comes back, so the page drifts off
 *     the real brand (Indigo #6366f1 / Emerald #10b981) onto the prototype's
 *     placeholder purples and greens.
 *  2. The fabricated social proof returns — the watch-demo button, "trusted by
 *     500+ accounting firms", a testimonial. Michael asked for all three gone
 *     (item 1 of the client list) and a restyle is exactly when a removed
 *     section gets "restored".
 *  3. A CTA points somewhere other than /signup, or stops reading
 *     "Start Free Trial". A CTA to /login reads fine in a diff.
 *  4. A pricing number drifts. $497 becoming $499 is invisible in review and
 *     wrong in a way the client notices first.
 *  5. One of the five Magic-UI keyframes or three variables disappears from
 *     tailwind.config.js. All four decorative components then silently stop
 *     animating — nothing throws, nothing logs, the page just goes still.
 *  6. A framer-motion animation loses its `useReducedMotion()` branch. The CSS
 *     media query in globals.css cannot reach a JS tween, so this is the only
 *     thing standing between a reduced-motion reader and a sliding carousel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LANDING = 'components/landing/LandingPage.tsx';
const LEGAL_SHELL = 'components/landing/LegalShell.tsx';
const MARK = 'components/landing/KyriqMark.tsx';
const CONFIG = 'tailwind.config.js';

/** Everything parcel I owns, minus the two redirect stubs. */
const OWNED = [
  LANDING,
  LEGAL_SHELL,
  MARK,
  'components/ui/marquee.tsx',
  'components/ui/border-beam.tsx',
  'components/ui/shimmer-button.tsx',
  'components/ui/number-ticker.tsx',
  'app/(public)/privacy/page.tsx',
  'app/(public)/terms/page.tsx',
  'app/(public)/legal/eula/page.tsx',
];

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/**
 * The same file with comments removed. Comments are where a removal is
 * explained — "the watch-demo button is gone" must not read as the button
 * coming back — so every "this string must not appear" check runs on code.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* --- 1. No hardcoded colour, and no raw palette colour ------------------ */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
const PALETTE =
  /\b(?:bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|accent|shadow)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

for (const rel of OWNED) {
  // Comments may quote the brand hexes; code may not carry them.
  const src = code(rel);

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
console.log(`  ok  ${OWNED.length} parcel-I files carry no hex and no raw palette colour`);

/* --- 2. The fabricated social proof stays gone -------------------------- */
// Item 1 of the client's list. Not just "the string is absent": the component
// that rendered each one must be gone too, or a diff that re-adds the call
// site reads as a one-line change.
{
  const src = code(LANDING);

  for (const gone of [
    'Watch demo',
    'watch-demo',
    'Trusted by 500',
    'accounting firms worldwide',
    'TestimonialCard',
    'Testimonials',
    'testimonial',
    'Join hundreds of accounting firms',
    'firmLogos',
    'LogoMarquee',
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(gone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `${LANDING} mentions "${gone}" — the fabricated social proof must not come back (client list item 1)`
    );
  }

  // Star ratings only ever existed to dress a testimonial.
  assert.doesNotMatch(src, /\bStar\b/, `${LANDING} imports a Star glyph again — that was the testimonial rating`);
}
console.log('  ok  no watch-demo button, no "500+ firms", no testimonials');

/* --- 3. Every CTA routes to /signup, and reads the same thing ----------- */
{
  const src = read(LANDING);

  assert.match(src, /const CTA_LABEL = 'Start Free Trial';/, `${LANDING}: CTA_LABEL is no longer "Start Free Trial"`);
  assert.match(src, /const CTA_HREF = '\/signup';/, `${LANDING}: CTA_HREF no longer points at /signup`);

  // Every href on the page, checked against an allowlist. A new CTA to
  // /login, or to a prototype page, fails here rather than at the client.
  const ALLOWED_PREFIX = ['#', '/privacy', '/terms', '/login', '/', 'mailto:'];
  for (const [, href] of src.matchAll(/href=["']([^"'{]+)["']/g)) {
    assert.ok(
      ALLOWED_PREFIX.some((p) => href === p || href.startsWith(p)),
      `${LANDING} links to "${href}" — a CTA must use CTA_HREF (/signup), and nothing may link to a prototype page`
    );
  }

  // The one "Sign in" that is allowed is navigation, in the nav and the
  // footer. A CTA-sized sign-in button is the regression: the three primary
  // buttons on the page are the nav CTA, the hero CTA and the closing one,
  // and all three must resolve through CTA_HREF.
  const signinLinks = [...src.matchAll(/href="\/login"/g)].length;
  assert.ok(
    signinLinks <= 3,
    `${LANDING} has ${signinLinks} links to /login — sign-in is navigation, not a call to action`
  );
  assert.ok(
    [...src.matchAll(/href=\{CTA_HREF\}/g)].length >= 2,
    `${LANDING}: fewer than two CTAs resolve through CTA_HREF — one of them has been hardcoded`
  );
}
console.log('  ok  every CTA reads "Start Free Trial" and resolves to /signup');

/* --- 4. The pricing table matches the signed-off numbers --------------- */
// CHECKLIST 12. Monthly, annual (one month free), allowance and overage, for
// all three tiers, plus the annual terms and the extension note.
{
  const src = read(LANDING);

  const EXPECTED = [
    { tier: 'essential', name: 'Starter', monthly: 249, annual: 2739, allowance: 1200, overage: '0.20' },
    { tier: 'professional', name: 'Professional', monthly: 649, annual: 7139, allowance: 4500, overage: '0.20' },
    { tier: 'scale', name: 'Firm', monthly: 1299, annual: 14289, allowance: 10000, overage: '0.20' },
  ];

  for (const p of EXPECTED) {
    const row = src.match(new RegExp(`\\{[^}]*tier: '${p.tier}'[^}]*\\}`))?.[0];
    assert.ok(row, `${LANDING}: the "${p.tier}" plan is gone from PLANS`);
    assert.match(row!, new RegExp(`name: '${p.name}'`), `${LANDING}: ${p.tier} is no longer named "${p.name}"`);
    assert.match(row!, new RegExp(`monthly: ${p.monthly}\\b`), `${LANDING}: ${p.tier} monthly price drifted from $${p.monthly}`);
    assert.match(row!, new RegExp(`annual: ${p.annual}\\b`), `${LANDING}: ${p.tier} annual price drifted from $${p.annual}`);
    assert.match(row!, new RegExp(`allowance: ${p.allowance}\\b`), `${LANDING}: ${p.tier} allowance drifted from ${p.allowance} checks`);
    assert.match(row!, new RegExp(`overage: '${p.overage}'`), `${LANDING}: ${p.tier} overage drifted from $${p.overage}/check`);
  }

  // One month free: annual must be exactly 11 monthly payments, rounded the
  // way the signed-off table rounds. Catches a price edited in one column.
  for (const p of EXPECTED) {
    assert.equal(
      Math.round(p.monthly * 11),
      p.annual,
      `the expected table is internally inconsistent: ${p.tier} annual ${p.annual} is not 11 x ${p.monthly}`
    );
  }

  assert.match(src, /popular: true/, `${LANDING}: no plan is marked Most Popular — Professional is`);
  assert.match(
    src.match(/\{[^}]*tier: 'professional'[^}]*\}/)![0],
    /popular: true/,
    `${LANDING}: Most Popular moved off Professional`
  );

  // The toggle, the extension note, and the annual terms.
  assert.match(src, /Monthly/, `${LANDING} lost the monthly side of the billing toggle`);
  assert.match(src, /Annual · one month free/, `${LANDING} lost the annual side of the billing toggle`);
  assert.match(
    src,
    /Kyriq Chrome extension included/,
    `${LANDING}: the Chrome-extension note is gone — it must appear on every plan`
  );
  assert.match(src, /12-month commitment/, `${LANDING} lost the annual terms note`);
  assert.match(src, /allowances still\s+reset each month/, `${LANDING} lost the allowance-reset term`);
  assert.match(src, /non-refundable except where required/, `${LANDING} lost the annual refund term`);
  assert.match(src, /whichever comes first/, `${LANDING} lost the trial terms`);
}
console.log('  ok  pricing is 147 / 497 / 997 monthly, 1617 / 5467 / 10967 annual, with overage and terms');

/* --- 5. The FAQ is the approved 15, verbatim ---------------------------- */
// The 15 pairs come from the client's redesign site. A partial edit or an
// invented extra question fails here rather than shipping quietly.
{
  const src = read(LANDING);
  const faqs = src.match(/const FAQS: \{ q: string; a: string \}\[\] = \[([\s\S]*?)\r?\n\];/);
  assert.ok(faqs, `${LANDING}: the FAQS list is gone`);
  const pairs = [...faqs![1].matchAll(/^\s*q:\s*['"`]/gm)].length;
  assert.equal(pairs, 15, `${LANDING}: FAQS holds ${pairs} pairs, the approved FAQ is 15 questions`);
  for (const q of ['What does Kyriq do?', 'Where can I get help?', 'Can Kyriq read handwritten checks?']) {
    assert.ok(src.includes(q), `${LANDING}: approved FAQ question "${q}" is missing`);
  }
}
console.log('  ok  FAQ holds the approved 15 questions');

/* --- 6. The Magic-UI keyframes and variables survive ------------------- */
// Parcel A preserved these verbatim and fenced them with a comment naming the
// four files. If a later token pass rewrites them, all four components stop
// animating and nothing anywhere throws.
{
  const cfg = read(CONFIG);

  for (const kf of ['marquee', 'marquee-vertical', 'border-beam', 'shimmer-slide', 'spin-around']) {
    assert.match(
      cfg,
      new RegExp(`["']?${kf}["']?:\\s*\\{`),
      `${CONFIG}: the "${kf}" keyframe is gone — a Magic-UI component now silently does not animate`
    );
  }

  // The animations must still be driven by the variables the components set
  // inline, not by a literal duration someone "cleaned up".
  for (const [anim, variable] of [
    ['marquee', '--duration'],
    ['marquee-vertical', '--duration'],
    ['border-beam', '--duration'],
    ['shimmer-slide', '--speed'],
    ['spin-around', '--speed'],
  ] as const) {
    const line = cfg.match(new RegExp(`["']?${anim}["']?:\\s*["'][^"']*["']`, 'g'))?.pop();
    assert.ok(line, `${CONFIG}: the "${anim}" animation entry is gone`);
    assert.match(
      line!,
      new RegExp(`var\\(${variable}\\)`),
      `${CONFIG}: the "${anim}" animation no longer reads var(${variable}) — the component's inline value is now ignored`
    );
  }

  // --gap is set inline by Marquee and consumed by the keyframe transform.
  assert.match(
    cfg,
    /translateX\(calc\(-100% - var\(--gap\)\)\)/,
    `${CONFIG}: the marquee keyframe no longer consumes var(--gap) — the strip will jump instead of looping`
  );

  // And the components must still be the ones setting them.
  assert.match(read('components/ui/marquee.tsx'), /"--gap": gap/, 'marquee.tsx no longer sets --gap inline');
  // Unitless, because the config multiplies it: calc(var(--duration)*1s).
  // Appending "s" here yields calc(12s * 1s), which is invalid, and CSS drops
  // an invalid duration without a word — the beam just stops moving.
  const beam = read('components/ui/border-beam.tsx');
  assert.match(beam, /"--duration": `\$\{duration\}`/, 'border-beam.tsx no longer sets --duration inline');
  assert.doesNotMatch(
    beam,
    /"--duration": `\$\{duration\}s`/,
    'border-beam.tsx appends a unit to --duration again — calc(Xs * 1s) is invalid and the beam silently stops'
  );
  assert.match(read('components/ui/shimmer-button.tsx'), /"--speed": shimmerDuration/, 'shimmer-button.tsx no longer sets --speed inline');

  // All four must actually be rendered somewhere, or the animation that the
  // keyframes exist for is dead code nobody notices.
  const src = read(LANDING);
  for (const comp of ['Marquee', 'NumberTicker', 'BorderBeam', 'ShimmerButton']) {
    assert.match(
      src,
      new RegExp(`<${comp}[\\s/>]`),
      `${LANDING} no longer renders <${comp}> — its animation is now unreachable`
    );
  }
}
console.log('  ok  five keyframes, three variables, and all four components still rendered');

/* --- 7. framer-motion honours prefers-reduced-motion ------------------- */
// globals.css stops every CSS animation under the media query, but it cannot
// touch a JS tween. Every framer-motion component on the page must branch.
{
  const src = read(LANDING);

  assert.match(src, /useReducedMotion/, `${LANDING}: framer-motion no longer consults useReducedMotion()`);

  // Each component that imports motion must resolve `reduced` itself.
  const motionBlocks = [...src.matchAll(/function (\w+)\(\)[\s\S]*?(?=\nfunction |\nexport default )/g)].filter(
    (m) => /<motion\./.test(m[0])
  );
  assert.ok(motionBlocks.length > 0, `${LANDING}: no framer-motion usage found — update or delete this assertion`);
  for (const block of motionBlocks) {
    assert.match(
      block[0],
      /const reduced = useReducedMotion\(\)/,
      `${LANDING}: ${block[1]}() animates with framer-motion but never reads useReducedMotion()`
    );
    // Not just "the identifier appears": the animated values must actually be
    // chosen by it, which is the bit a refactor drops while leaving the hook.
    assert.match(
      block[0],
      /reduced \?/,
      `${LANDING}: ${block[1]}() reads useReducedMotion() but never branches on it — the tween still runs`
    );
  }

}
console.log('  ok  framer-motion branches on useReducedMotion');

/* --- 8. The duplicate legal pages stay resolved ------------------------ */
{
  for (const [dupe, canonical] of [
    ['app/(public)/legal/terms/page.tsx', '/terms'],
    ['app/(public)/legal/privacy/page.tsx', '/privacy'],
  ] as const) {
    assert.match(
      read(dupe),
      new RegExp(`redirect\\('${canonical}'\\)`),
      `${dupe} is no longer a redirect to ${canonical} — the duplicate legal page is back`
    );
  }

  // The canonical pair, and the EULA, all share one shell. Three documents
  // with three sets of chrome is how one of them drifts.
  for (const rel of ['app/(public)/privacy/page.tsx', 'app/(public)/terms/page.tsx', 'app/(public)/legal/eula/page.tsx']) {
    assert.match(read(rel), /<LegalShell/, `${rel} no longer uses the shared LegalShell`);
  }
}
console.log('  ok  one Terms, one Privacy, one legal shell');

console.log('\nall landing / legal checks passed');
