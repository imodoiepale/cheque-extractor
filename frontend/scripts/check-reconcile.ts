/**
 * Self-check for the /reconcile stepper shell (CHECKLIST section 3).
 *
 *   cd frontend && npx tsx scripts/check-reconcile.ts
 *
 * No test framework on purpose. These are the regressions that would actually
 * ship unnoticed, because each one LOOKS fine on screen:
 *
 *  1. A step number gets rendered straight from a click instead of going
 *     through POST /api/batches/[id]/advance. That is exactly the v17
 *     prototype's hole: Approve reachable from Upload.
 *  2. A 409 step_locked gets swallowed, so a locked step is a dead control
 *     with no explanation — or worse, the click appears to work.
 *  3. The Continue Reconciliation card computes its own "Step N of 4" instead
 *     of rendering the server's `summary`, so the card and the page disagree.
 *  4. `batch: null` from /api/batches/resume is treated as an error, which
 *     would greet every new firm with a failure instead of step 1.
 *  5. A literal hex or a raw Tailwind palette class appears, so the surface
 *     stops tracking the token file.
 *  6. The shell loses its active-route state again (or lights up two rows).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EMPTY_COUNTS, deriveBatchSteps, canEnterStep } from '../lib/batch-state';
import { NAV_GROUPS, activeNavHref, isActiveHref } from '../lib/shell-nav';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** Source with comments stripped: a comment naming a thing is not the thing. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const PAGE = 'app/(app)/reconcile/page.tsx';
const STEPPER = 'components/reconcile/Stepper.tsx';
const MATCH = 'components/reconcile/MatchProgress.tsx';
const CONNECT = 'components/reconcile/ConnectQuickBooksCard.tsx';
const CLIENT = 'lib/reconcile-client.ts';
const SHELL = 'app/(app)/layout.tsx';
const NAV = 'lib/shell-nav.ts';

const OWNED = [PAGE, STEPPER, MATCH, CONNECT, CLIENT, SHELL, NAV];

/* ── 1. No step is rendered without going through advance ───────────────── */

// The page's only step writer is setActiveStep, and every call site must take
// a value the SERVER produced: entered_step, state.current_step, or the
// literal 3 inside the auto-advance callback that fires on an accepted
// advance. A `setActiveStep(step)` — the clicked value — is the regression.
const pageCode = code(PAGE);
const stepWrites = [...pageCode.matchAll(/setActiveStep\(([^)]*)\)/g)].map((m) => m[1].trim());
assert.ok(stepWrites.length > 0, `${PAGE} no longer sets the active step at all`);
const ALLOWED_STEP_SOURCES = /^(result\.entered_step|state\.batch\.state\.current_step|3)$/;
for (const arg of stepWrites) {
  assert.match(
    arg,
    ALLOWED_STEP_SOURCES,
    `${PAGE} sets the active step from "${arg}" — a step may only come from a server ` +
      `value (entered_step / batch.state.current_step), never from the clicked step`
  );
}

// The click handler must POST advance, and must not shortcut on `unlocked`.
assert.match(
  pageCode,
  /await advanceStep\(batch\.id,\s*step\)/,
  `${PAGE} selectStep no longer POSTs to advance — the server must decide the step`
);
assert.doesNotMatch(
  pageCode,
  /if\s*\([^)]*\.unlocked[^)]*\)\s*\{?\s*setActiveStep/,
  `${PAGE} moves to a step on a client-side unlocked check instead of calling advance`
);

// Step 2 auto-advance is also an advance call, not a local jump.
assert.match(
  code(MATCH),
  /await advanceStep\(next\.id,\s*3\)/,
  `${MATCH} no longer asks the server to enter step 3 when matching finishes`
);

/* ── 2. A 409 is surfaced, not swallowed ───────────────────────────────── */

const clientCode = code(CLIENT);
assert.match(
  clientCode,
  /res\.status === 409[\s\S]{0,200}step_locked/,
  `${CLIENT} no longer recognises 409 step_locked`
);
assert.match(
  clientCode,
  /kind: 'step_locked'[\s\S]{0,400}reason: String\(body\.reason/,
  `${CLIENT} drops the reason off a step_locked response — a locked step could not explain itself`
);
// The page must do something with it: set the locked notice.
assert.match(
  pageCode,
  /result\.kind === 'step_locked'[\s\S]{0,300}setLocked\(\{ step, reason: result\.reason \}\)/,
  `${PAGE} swallows a 409 step_locked instead of surfacing the reason`
);
// And the stepper must render it.
assert.match(
  code(STEPPER),
  /lockedReason/,
  `${STEPPER} no longer renders the refusal reason`
);
// A locked step must be disabled AND explain itself. A disabled control with
// no reason is the dead-link bug wearing a different hat.
const stepperCode = code(STEPPER);
assert.match(
  stepperCode,
  /(?<![-\w])disabled=\{locked/,
  `${STEPPER} locked steps are no longer disabled (aria-disabled alone does not stop a click)`
);
assert.match(
  stepperCode,
  /locked && s\.reason/,
  `${STEPPER} locked steps no longer show why they are locked`
);

/* ── 3. The Continue card renders the server's summary ─────────────────── */

// "Step 3 of 4" is summary.step_label, built server-side. Computing it here
// means the card can disagree with the stepper.
assert.match(
  pageCode,
  /summary\.step_label/,
  `${PAGE} Continue card no longer renders summary.step_label`
);
for (const field of ['summary.heading', 'summary.period', 'summary.attention_label']) {
  assert.ok(
    pageCode.includes(field),
    `${PAGE} Continue card no longer shows ${field} — Michael's card needs company, account, period and attention count`
  );
}
assert.doesNotMatch(
  pageCode,
  /`Step \$\{[^}]*\} of 4`|'Step ' \+|"Step " \+/,
  `${PAGE} fabricates its own "Step N of 4" instead of using summary.step_label`
);

/* ── 4. batch: null is a first run, not an error ────────────────────────── */

assert.match(
  clientCode,
  /if \(!body\?\.batch\)[\s\S]{0,160}first_run/,
  `${CLIENT} no longer treats a 200 with batch: null as a first run`
);
assert.doesNotMatch(
  clientCode,
  /if \(!body\?\.batch\)[\s\S]{0,80}toFailure/,
  `${CLIENT} turns "nothing to resume" into a failure — that is every new firm's first visit`
);
// 503 must stay honest rather than becoming a zero-count batch.
assert.match(
  clientCode,
  /migration_not_applied/,
  `${CLIENT} no longer reports migration_not_applied honestly`
);
assert.doesNotMatch(
  clientCode,
  /EMPTY_COUNTS/,
  `${CLIENT} fabricates a zero-count batch instead of reporting the real failure`
);
// The first-run stepper comes from the shared derivation, not a hand-written
// array of four steps.
assert.match(
  pageCode,
  /deriveBatchSteps\(EMPTY_COUNTS, 'open'\)/,
  `${PAGE} first run no longer derives its steps from the shared rule`
);

/* ── 5. Tokens only ────────────────────────────────────────────────────── */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
const PALETTE =
  /\b(?:bg|text|border|ring|from|via|to|divide|fill|stroke|shadow|outline|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

for (const rel of OWNED) {
  const src = read(rel);
  assert.equal(
    src.match(HEX),
    null,
    `${rel} has a hardcoded hex — colour belongs to the token file`
  );
  assert.equal(
    src.match(PALETTE),
    null,
    `${rel} uses a raw Tailwind palette class — use the Kyriq tokens`
  );
}

/* ── 6. The shell has active-route state, on exactly one row ───────────── */

const shellCode = code(SHELL);
assert.match(shellCode, /^'use client';/m, `${SHELL} is not a client component — it has no pathname`);
assert.match(shellCode, /usePathname\(\)/, `${SHELL} no longer reads the pathname`);
assert.match(
  shellCode,
  /sidebar-item \$\{active \? 'active' : ''\}/,
  `${SHELL} no longer applies the .sidebar-item.active hook`
);
assert.match(shellCode, /aria-current=\{active \? 'page' : undefined\}/, `${SHELL} lost aria-current`);
// The shell checks still apply.
assert.match(shellCode, /\bw-60\b/, `${SHELL} lost the shared shell width`);
assert.match(shellCode, /\bmd:ml-60\b/, `${SHELL} main offset no longer matches the shell`);

// Exactly one row is active, including the overlapping /settings pair.
assert.equal(activeNavHref('/reconcile'), '/reconcile');
assert.equal(activeNavHref('/settings'), '/settings');
assert.equal(activeNavHref('/settings/team'), '/settings/team');
assert.equal(activeNavHref('/nowhere'), null);
assert.equal(activeNavHref(null), null);
// A detail route lights up its section.
assert.equal(activeNavHref('/process/abc'), null);
assert.equal(isActiveHref('/settings?tab=integrations', '/settings'), true);
assert.equal(isActiveHref('/settings', '/settings-other'), false);

// Section 3's nav is present, and /qb-match is NOT removed (its removal
// belongs with the Review merge).
const labels = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
for (const label of ['Reconcile', 'History', 'Reports', 'Connections', 'Users', 'Settings', 'Billing']) {
  assert.ok(labels.includes(label), `shell nav lost "${label}" (CHECKLIST section 3)`);
}
assert.ok(
  NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/qb-match'),
  '/qb-match was removed from the nav — that belongs with the Review merge, not this parcel'
);
assert.equal(NAV_GROUPS[0].items[0].href, '/reconcile', 'Reconcile must be the first nav row');

/* ── 7. The gating rule the UI leans on actually gates ─────────────────── */

// Not a restatement of batch-state's own check: this asserts the two things
// THIS parcel renders — that a first run locks steps 2-4 with a reason, and
// that step 4 from a first run is refused with step 1 named.
const firstRun = deriveBatchSteps(EMPTY_COUNTS, 'open');
assert.equal(firstRun.current_step, 1);
assert.equal(firstRun.steps[0].unlocked, true);
for (const s of firstRun.steps.slice(1)) {
  assert.equal(s.unlocked, false, `step ${s.step} must be locked on a first run`);
  assert.ok(s.reason, `step ${s.step} must say why it is locked`);
}
const refused = canEnterStep(4, firstRun);
assert.equal(refused.ok, false, 'Approve must not be reachable from Upload');
assert.equal(refused.blocking_step, 1);
assert.ok(refused.reason && /Upload/.test(refused.reason));

/* ── 8. Connect QuickBooks fetches before redirecting ──────────────────── */

const connectCode = code(CONNECT);
assert.doesNotMatch(
  connectCode,
  /href=["'][^"']*\/api\/qbo\/auth/,
  `${CONNECT} points an anchor at /api/qbo/auth — that answers with JSON and does not redirect`
);
assert.match(
  connectCode,
  /startQuickBooksConnect\(\)/,
  `${CONNECT} no longer uses the fetch-then-redirect helper`
);
assert.match(
  clientCode,
  /authUrl/,
  `${CLIENT} no longer reads {authUrl} off /api/qbo/auth`
);
// The card must be on step 1, above the upload box, and only when there is no
// connected company.
assert.match(
  pageCode,
  /!hasConnections \? <ConnectQuickBooksCard \/> : null\}\s*<UploadSlot/,
  `${PAGE} Connect QuickBooks card is no longer inline above the upload box on step 1`
);

/* ── 9. Match is a progress screen, not a button ───────────────────────── */

const matchCode = code(MATCH);
assert.match(matchCode, /setInterval\(/, `${MATCH} no longer polls — Match would never advance`);
assert.doesNotMatch(
  matchCode,
  /<Button[^>]*>\s*(Continue|Next)/,
  `${MATCH} grew a Continue button — step 2 must move on by itself`
);
// Matching that never finishes is a visible state, not an eternal spinner.
assert.match(matchCode, /STALL_MS/, `${MATCH} no longer detects a stalled matcher`);
assert.match(matchCode, /setStalled\(true\)/, `${MATCH} never reports a stall to the reader`);

console.log('\nall /reconcile stepper checks passed');
