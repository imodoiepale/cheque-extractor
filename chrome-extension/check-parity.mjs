#!/usr/bin/env node
/**
 * Chrome extension / app parity check.  `node chrome-extension/check-parity.mjs`
 *
 * There is no build step and no test runner in chrome-extension/, so this is
 * the one runnable guard. Plain asserts, no framework, no fixtures.
 *
 * It bites on the five things that have actually gone wrong here before:
 *
 *   1. RETIRED COLOURS. QuickBooks green #2CA01C and the old app navy
 *      #1e2235 / #1a1a2e must not reappear in any live declaration.
 *   2. DECLARATION ORDER. `-webkit-backdrop-filter` must come BEFORE
 *      `backdrop-filter` in every rule. Authored the other way round, a
 *      minifier drops the standard property and leaves only the prefix, which
 *      computes to `backdrop-filter: none` in Chrome. Verified in Chrome 152.
 *      The @supports fallback cannot catch it, because the browser DOES
 *      support the property.
 *   3. THE @supports FALLBACK. Present in every stylesheet that blurs.
 *   4. NO BLUR ON LIST ROWS. backdrop-filter is expensive and these lists run
 *      to hundreds of rows. Glass belongs on containers and headers only, and
 *      two blurred surfaces are never nested.
 *   5. ONE CLICK, ONE ROW. Commit 57f2adf ("stop bulk-ticking all approved
 *      rows after a single sidepanel approval") removed a post-approval
 *      re-init that re-ran the whole page automation and auto-ticked every
 *      previously-approved row. This asserts it stays removed.
 *
 * Plus a drift check: the literal token values in styles/tokens.css must still
 * equal the ones in frontend/app/globals.css. tokens.css is a HAND port, so
 * nothing else would notice the app moving out from under it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const EXT = dirname(fileURLToPath(import.meta.url));
const REPO = join(EXT, '..');
const read = (rel) => readFileSync(join(EXT, rel), 'utf8');

/** Strip comments so a colour NAMED in prose does not count as one USED. */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = (js) =>
  js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const CSS_FILES = [
  'styles/tokens.css',
  'sidepanel/sidepanel.css',
  'popup/popup.css',
  'content/qbo-overlay.css',
  'options/options.css',
];
const MARKUP_FILES = [
  'sidepanel/sidepanel.html',
  'popup/popup.html',
  'options/options.html',
];

let checks = 0;
const ok = (label) => { checks++; console.log(`  ok  ${label}`); };

// ── 1. Retired colours ─────────────────────────────────────────────────────
const RETIRED = [
  ['#2CA01C', 'QuickBooks green'],
  ['#1e2235', 'old app navy'],
  ['#1a1a2e', 'old app navy'],
];
for (const rel of [...CSS_FILES, ...MARKUP_FILES]) {
  const body = rel.endsWith('.css')
    ? stripCssComments(read(rel))
    : read(rel).replace(/<!--[\s\S]*?-->/g, '');
  for (const [hex, what] of RETIRED) {
    assert.ok(
      !new RegExp(hex.replace('#', '#'), 'i').test(body),
      `${rel} still uses ${hex} (${what}) in a live declaration`
    );
  }
}
ok('no retired brand colours (#2CA01C / #1e2235 / #1a1a2e) in any live declaration');

// ── 2. Prefixed FIRST, standard LAST, in every rule ────────────────────────
let blurRules = 0;
for (const rel of CSS_FILES) {
  const css = stripCssComments(read(rel));
  // Split on rule boundaries; a declaration block cannot contain '{' or '}'.
  for (const block of css.split('}')) {
    const webkit = block.indexOf('-webkit-backdrop-filter');
    // The unprefixed one, not the tail of the prefixed one.
    const std = block.search(/(?<!-webkit-)\bbackdrop-filter\s*:/);
    if (webkit === -1 && std === -1) continue;
    // @supports conditions name both properties without declaring them.
    if (/@supports/.test(block)) continue;
    assert.notEqual(webkit, -1, `${rel}: backdrop-filter with no -webkit- sibling:\n${block.trim().slice(0, 160)}`);
    assert.notEqual(std, -1, `${rel}: -webkit-backdrop-filter with no standard sibling (computes to none):\n${block.trim().slice(0, 160)}`);
    assert.ok(webkit < std, `${rel}: -webkit-backdrop-filter must be authored BEFORE backdrop-filter:\n${block.trim().slice(0, 160)}`);
    blurRules++;
  }
}
assert.ok(blurRules >= 10, `expected the glass surfaces to still be glass, found only ${blurRules} blurred rules`);
ok(`${blurRules} blurred rules, every one prefixed-first / standard-last`);

// ── 3. The @supports fallback ──────────────────────────────────────────────
const SUPPORTS = '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
for (const rel of CSS_FILES) {
  if (rel === 'styles/tokens.css') continue; // tokens only, no surfaces of its own
  assert.ok(read(rel).includes(SUPPORTS), `${rel} is missing the @supports glass fallback`);
}
ok('@supports glass fallback present in every stylesheet that blurs');

// ── 4. No blur on a list row ───────────────────────────────────────────────
// These classes are repeated per record. One blurred surface per row would be
// hundreds of blurred surfaces on a real reconciliation.
const ROW_SELECTORS = [
  '.match-row', '.check-card', '.qb-card', '.doc-card', '.history-item',
  '.extracted-card', '.file-item', '.attention-chip', '.pill', '.src-pill',
  '[data-kyriq-highlighted]', '.kyriq-badge',
];
for (const rel of CSS_FILES) {
  const css = stripCssComments(read(rel));
  for (const block of css.split('}')) {
    if (!/backdrop-filter/.test(block)) continue;
    const selector = (block.split('{')[0] || '').trim();
    for (const row of ROW_SELECTORS) {
      assert.ok(
        !selector.includes(row),
        `${rel}: list row "${row}" must not be a blurred surface -- selector was "${selector}"`
      );
    }
  }
}
ok('no backdrop-filter on any per-record list row');

// ── 5. One click, one row (regression guard for 57f2adf) ───────────────────
const overlay = read('content/qbo-overlay.js');
const implStart = overlay.indexOf('async function _handleNewApprovalImpl');
assert.notEqual(implStart, -1, '_handleNewApprovalImpl went missing from content/qbo-overlay.js');
// The next top-level `async function` / `function` at the same indent ends it.
const after = overlay.slice(implStart + 1);
const nextFn = after.search(/\n  (?:async )?function /);
const impl = stripJsComments(nextFn === -1 ? after : after.slice(0, nextFn));

assert.ok(
  !/runPageAutomation\s*\(/.test(impl),
  '_handleNewApprovalImpl calls runPageAutomation() again -- that is the 57f2adf bug: ' +
  're-running the page automation re-fetches every previously-approved check and ' +
  'auto-ticks them all, so one sidepanel approval bulk-ticks the whole page.'
);
// Every clear loop must stop after the single row it matched.
const clearLoops = impl.split(/for \(const row of /).slice(1);
assert.ok(clearLoops.length >= 2, `expected the reconcile and register clear loops, found ${clearLoops.length}`);
for (const loop of clearLoops) {
  const body = loop.slice(0, loop.indexOf('\n    }\n') + 1 || loop.length);
  assert.ok(
    /\bbreak\b/.test(body),
    'a clear loop in _handleNewApprovalImpl has no break -- it would tick every matching row, ' +
    'not the one that was approved'
  );
}
ok('one approval affects exactly one row (no re-init, every clear loop breaks)');

// ── 6. Token drift against the app ─────────────────────────────────────────
// Only the tokens written as literals in BOTH files. globals.css keeps most
// colours as bare HSL triples for Tailwind's hsl(var(--x)) wrapper, which the
// extension does not use, so those cannot be compared textually.
const globals = readFileSync(join(REPO, 'frontend/app/globals.css'), 'utf8');
const tokens = read('styles/tokens.css');
const valueOf = (css, name) => {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};
const SHARED = [
  'glass-card-bg', 'glass-panel-bg', 'glass-modal-bg', 'glass-chrome-bg',
  'glass-toast-bg', 'glass-selected-bg', 'glass-border', 'glass-hairline',
  'glass-fallback-bg', 'glass-opaque-bg', 'shell-bg', 'shell-bg-fallback',
  'bevel', 'bevel-dark', 'radius-input', 'radius-btn', 'radius-pill',
  'radius-tile', 'radius-card', 'radius-modal', 'ease-settle', 'ease-spring',
  'ease-exit', 'dur-tap', 'dur-quick', 'dur-settle', 'dur-reveal',
  'press-scale', 'disabled-opacity', 'shadow-hairline', 'shadow-contact',
  'shadow-glass', 'shadow-glass-hover', 'shadow-glass-panel',
  'shadow-glass-modal', 'shadow-glass-sheet', 'shadow-glass-toast',
  'shadow-glass-selected', 'shadow-brand-glow', 'shadow-inner-track',
];
for (const name of SHARED) {
  const app = valueOf(globals, name);
  const ext = valueOf(tokens, name);
  assert.ok(app, `frontend/app/globals.css no longer defines --${name}`);
  assert.ok(ext, `chrome-extension/styles/tokens.css is missing --${name}`);
  assert.equal(
    ext, app,
    `--${name} has drifted: app has "${app}", extension has "${ext}". ` +
    'tokens.css is a hand port -- update it when globals.css moves.'
  );
}
ok(`${SHARED.length} literal tokens still match frontend/app/globals.css`);

// Brand hexes: globals.css states them in the comment beside the HSL triple.
assert.ok(/Indigo #6366f1, Emerald #10b981/i.test(globals), 'globals.css no longer names the brand hexes');
assert.equal(valueOf(tokens, 'brand'), '#6366f1', 'extension --brand is not Indigo #6366f1');
assert.equal(valueOf(tokens, 'emerald'), '#10b981', 'extension --emerald is not Emerald #10b981');
ok('brand Indigo #6366f1 / Emerald #10b981 match the app');

// ── 7. The approved /extension surface is actually in the markup ───────────
const html = read('sidepanel/sidepanel.html');
for (const id of ['company-select', 'account-select', 'btn-sync', 'qb-status',
                  'usage-meter', 'btn-open-qb', 'attention-bar']) {
  assert.ok(html.includes(`id="${id}"`), `sidepanel.html is missing #${id}`);
}
for (const tab of ['upload', 'matches', 'cheques', 'approve', 'history']) {
  assert.ok(html.includes(`data-tab="${tab}"`), `sidepanel.html is missing the "${tab}" tab`);
}
for (const chip of ['lowconf', 'duplicate', 'discrepancy', 'unmatched']) {
  assert.ok(html.includes(`data-attention="${chip}"`), `sidepanel.html is missing the "${chip}" attention chip`);
}
// Item 7 resolves the realm server-side, from qb_connections.is_active.
const sw = read('background/service-worker.js');
const caseStart = sw.indexOf("case 'OPEN_QB_COMPANY'");
assert.notEqual(caseStart, -1, 'service worker has no OPEN_QB_COMPANY handler (client list item 7)');
const caseBody = sw.slice(caseStart, sw.indexOf("case '", caseStart + 10));
assert.ok(
  /getValidQBToken\(\)/.test(caseBody),
  'OPEN_QB_COMPANY must take the realm from getValidQBToken() (which reads ' +
  'qb_connections.is_active), not from local storage -- otherwise the panel and ' +
  'the backend can disagree about which company is active.'
);
assert.ok(/company=\$\{encodeURIComponent\(realmId\)\}/.test(caseBody),
  'OPEN_QB_COMPANY does not pin the QuickBooks URL to the active realm');
ok('header controls, five approved tabs, four attention chips, server-side active realm');

// ── 8. Every extension page is reachable and its script actually runs ──────
// options.html shipped for months with its logic in an inline <script>, which
// MV3's extension-page CSP blocks outright — the page rendered and silently
// did nothing — and with no manifest entry at all, so nothing could open it.
const manifest = JSON.parse(read('manifest.json'));
assert.equal(
  manifest.options_ui?.page, 'options/options.html',
  'manifest.json does not declare options_ui.page — the settings page is unreachable'
);
for (const rel of MARKUP_FILES) {
  const markup = read(rel).replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of markup.match(/<script\b[^>]*>/gi) || []) {
    assert.ok(
      /\bsrc\s*=/.test(tag),
      `${rel} has an inline <script> — MV3's extension-page CSP blocks it, so it never runs. ` +
      'Move the code to its own .js file and load it with src.'
    );
  }
  assert.ok(
    !/\son[a-z]+\s*=\s*["']/i.test(markup),
    `${rel} has an inline event handler attribute — also blocked by the MV3 CSP.`
  );
}
// Relative asset paths: options/ and popup/ are one level down from icons/.
for (const rel of MARKUP_FILES) {
  for (const m of read(rel).matchAll(/(?:src|href)="([^"]*icons\/[^"]*)"/g)) {
    assert.ok(
      m[1].startsWith('../icons/'),
      `${rel} references "${m[1]}" — pages live one directory down, so icon paths need ../`
    );
  }
}
ok('every page declared, no inline script or handler, icon paths resolve');

console.log(`\n${checks} checks passed.`);
