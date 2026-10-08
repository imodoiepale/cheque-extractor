/**
 * Self-check for settings, team and the four auth pages (parcel D).
 *
 *   cd frontend && npx tsx scripts/check-parcel-d.ts
 *
 * No test framework on purpose. These are the regressions that would really
 * happen to these files, and not one of them is loud:
 *
 *  1. A literal hex or a raw Tailwind palette utility comes back, so the
 *     surface stops tracking the token file. There were 366 palette calls
 *     across these six files before the migration.
 *  2. The matching-preferences panel is "restored" into Settings. Michael
 *     removed it deliberately ("Don't think that has any value"), and it is
 *     in the v12/v17 prototype HTML, so the next agent reading the prototype
 *     will put it back.
 *  3. The signup plan picker comes back, or the password minimum drops below
 *     8, or the terms-and-privacy consent becomes optional. All three read
 *     fine in a diff and all three are requirements in CHECKLIST section 6.
 *  4. A public CTA points at /login instead of /signup, or stops saying
 *     "Start Free Trial".
 *  5. The sign-in button loses the brand gradient (client change list item 2:
 *     the sign-in button is purple/brand, matching the website).
 *  6. A form control loses its Field wrapper, so its error is coloured but
 *     never announced.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/**
 * Comments are stripped before the "did this come back?" checks run. The
 * comments in these files NAME the removed panels in order to record why they
 * are absent, and a check that cannot tell a warning from a regression gets
 * deleted by the first person it blocks.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const SETTINGS = 'app/(app)/settings/page.tsx';
const TEAM = 'app/(app)/settings/team/page.tsx';
const LOGIN = 'app/(auth)/login/page.tsx';
const SIGNUP = 'app/(auth)/signup/page.tsx';
const FORGOT = 'app/(auth)/forgot-password/page.tsx';
const RESET = 'app/(auth)/reset-password/page.tsx';

/** Every file parcel D owns. */
const OWNED = [SETTINGS, TEAM, LOGIN, SIGNUP, FORGOT, RESET];

/* --- 1. Colour belongs to the token file -------------------------------- */

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;

/**
 * Matching the palette NAME rather than a list of utilities catches
 * `ring-blue-500` and `divide-gray-100` as well as `bg-blue-600`.
 */
const PALETTE = new RegExp(
  '\\b(?:bg|text|border|ring|from|to|via|divide|accent|placeholder|decoration|outline|shadow|fill|stroke)-' +
    '(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
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

  const palette = src.match(PALETTE);
  assert.equal(
    palette,
    null,
    `${rel} uses raw Tailwind palette colour(s) ${JSON.stringify(palette)} — use the token families`
  );
}
console.log(`  ok  ${OWNED.length} parcel-D files: no hex, no raw palette colour`);

/* --- 2. The matching-preferences panel stays gone ----------------------- */
// CHECKLIST 3 keeps exactly ONE control from that panel — the auto-approve
// threshold — and moves it next to Approve All on the Review step. So the
// giveaway is not the word "threshold" (Review may legitimately link here one
// day) but the OTHER five controls of the prototype panel reappearing in
// Settings: nothing else in Settings has any business mentioning them.
{
  const src = code(SETTINGS);

  for (const control of [
    'Matching preferences',
    'Auto-match threshold',
    'Possible-match threshold',
    'Amount tolerance',
    'Date tolerance',
    'Payee normalization',
    'Payee normalisation',
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(control.replace(/[-\s]/g, '[-\\s]'), 'i'),
      `${SETTINGS} mentions "${control}" — the matching-preferences panel must not come back (it belongs on Review, CHECKLIST 3)`
    );
  }

  // The Security tab and the /settings/team link are RECENT committed work
  // (roles / MFA parcel). A restyling pass is exactly when they get dropped.
  assert.match(src, /href="\/mfa"/, `${SETTINGS} lost the Security tab's link to /mfa`);
  assert.match(
    src,
    /href="\/settings\/team"/,
    `${SETTINGS} lost the link to /settings/team — the dead "coming soon" panel must not return`
  );
  assert.match(
    src,
    /value: 'security'/,
    `${SETTINGS} lost the Security tab itself`
  );
}
console.log('  ok  settings: no matching-preferences panel; Security tab and team link intact');

/* --- 3. Signup matches CHECKLIST section 6 ------------------------------ */
{
  const src = code(SIGNUP);

  // No plan picker. The plan is chosen in billing, not at signup.
  for (const trace of ['selectedPlan', 'setSelectedPlan', 'plans', "'starter'", "'growth'", 'Most Popular']) {
    assert.doesNotMatch(
      src,
      new RegExp(trace.replace(/[$^*+?()[\]{}|\\.]/g, '\\$&')),
      `${SIGNUP} mentions "${trace}" — the plan picker must not come back (CHECKLIST 6)`
    );
  }

  // Four name/identity fields, each wired by id so its label and error are
  // actually associated. Checking the id, not the label text, because the
  // copy may change and the wiring may not.
  for (const id of ['firstName', 'lastName', 'firmName', 'email', 'password']) {
    assert.match(src, new RegExp(`id="${id}"`), `${SIGNUP} no longer has a #${id} control`);
  }

  // The minimum must be a single constant >= 8, used by BOTH the browser
  // attribute and the JS guard. A literal 6 anywhere near the password is the
  // old rule creeping back; a constant the guard ignores is worse, because
  // minLength alone is trivially bypassed.
  const min = src.match(/const PASSWORD_MIN = (\d+);/)?.[1];
  assert.ok(min, `${SIGNUP} no longer declares PASSWORD_MIN`);
  assert.ok(
    Number(min) >= 8,
    `${SIGNUP}: PASSWORD_MIN is ${min} — CHECKLIST 6 requires at least 8 characters`
  );
  assert.match(
    src,
    /password\.length < PASSWORD_MIN/,
    `${SIGNUP}: the submit guard no longer enforces PASSWORD_MIN — minLength alone is a hint, not a rule`
  );
  assert.match(
    src,
    /minLength=\{PASSWORD_MIN\}/,
    `${SIGNUP}: the password input's minLength no longer tracks PASSWORD_MIN`
  );

  // Consent is REQUIRED: it must block submit, not merely render.
  // `!consent` has to appear in the validator that gates the submit, so
  // deleting the branch while leaving the checkbox in the JSX fails here.
  const validator = src.match(/const validate = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(validator, `${SIGNUP} no longer has a single validate() gating submit`);
  assert.match(
    validator!,
    /if \(!consent\)/,
    `${SIGNUP}: validate() no longer rejects an unchecked consent box — consent is now optional`
  );
  assert.match(
    src,
    /if \(Object\.keys\(found\)\.length > 0\) return;/,
    `${SIGNUP}: submit no longer stops on validation errors, so consent and the password rule are decorative`
  );
  assert.match(src, /href="\/terms"/, `${SIGNUP}: the consent text no longer links the Terms`);
  assert.match(src, /href="\/privacy"/, `${SIGNUP}: the consent text no longer links the Privacy Policy`);

  assert.match(
    src,
    /Create Account and Start Trial/,
    `${SIGNUP}: the CTA no longer reads "Create Account and Start Trial"`
  );
}
console.log('  ok  signup: no plan picker, 8-char minimum enforced in JS, consent required');

/* --- 4. Public CTAs point at signup ------------------------------------- */
{
  const src = code(LOGIN);
  assert.match(
    src,
    /href="\/signup"[\s\S]{0,200}Start Free Trial/,
    `${LOGIN}: the trial CTA no longer says "Start Free Trial" pointing at /signup (CHECKLIST 6)`
  );

  // The reset flow must be reachable, or a locked-out user has no way back in.
  assert.match(src, /href="\/forgot-password"/, `${LOGIN} lost the password-reset link`);
}
console.log('  ok  login: trial CTA says "Start Free Trial" and routes to /signup');

/* --- 5. The sign-in button is brand/purple ------------------------------ */
// Item 2 of the client's change list. `variant="primary"` is the Button
// default, so the regression is someone passing secondary/ghost to "calm it
// down": the submit must carry no variant override at all.
{
  const submit = code(LOGIN).match(/<Button type="submit"[^>]*>/)?.[0];
  assert.ok(submit, `${LOGIN} no longer has a submit Button`);
  assert.doesNotMatch(
    submit!,
    /variant=/,
    `${LOGIN}: the sign-in button overrides the primary variant — it must stay the brand gradient (client change list, item 2)`
  );
  assert.match(submit!, /\bblock\b/, `${LOGIN}: the sign-in button is no longer full width`);
}
console.log('  ok  sign-in button keeps the brand gradient');

/* --- 6. Password policy is the same on reset as on signup --------------- */
{
  const resetMin = code(RESET).match(/const PASSWORD_MIN = (\d+);/)?.[1];
  const signupMin = code(SIGNUP).match(/const PASSWORD_MIN = (\d+);/)?.[1];
  assert.ok(resetMin, `${RESET} no longer declares PASSWORD_MIN`);
  assert.equal(
    resetMin,
    signupMin,
    `${RESET}: the reset minimum (${resetMin}) no longer matches signup (${signupMin}) — a reset flow that accepts a shorter password is a hole in the policy`
  );
  assert.match(
    code(RESET),
    /password\.length < PASSWORD_MIN/,
    `${RESET}: the submit guard no longer enforces PASSWORD_MIN`
  );
}
console.log('  ok  reset password enforces the same minimum as signup');

/* --- 7. Every control keeps its Field wrapper and its primitives -------- */
// Colour alone is not a state (rule 10 / DESIGN-SYSTEM): an invalid input has
// to carry BOTH `state="invalid"` and a Field error, or the message exists
// only as a red border and a screen reader hears nothing.
for (const rel of [LOGIN, SIGNUP, FORGOT, RESET, TEAM]) {
  const src = code(rel);
  const inputs = [...src.matchAll(/<Input\b/g)].length;
  const fields = [...src.matchAll(/<Field\b/g)].length;
  assert.ok(inputs > 0, `${rel} renders no Input — did it go back to a bare <input>?`);
  assert.ok(
    fields >= inputs,
    `${rel} has ${inputs} Input(s) but only ${fields} Field(s) — a control without a Field has a label and an error nothing is wired to`
  );

  // Raw <input> is allowed ONLY for checkboxes: there is no Checkbox
  // primitive yet (reported to parcel A, not worked around).
  for (const [, attrs] of src.matchAll(/<input\s([^>]*)>/g)) {
    assert.match(
      attrs,
      /type="(?:checkbox|file)"/,
      `${rel} renders a bare <input> that is not a checkbox or file picker — use the Input primitive`
    );
  }
}
for (const rel of [LOGIN, SIGNUP, FORGOT, RESET, TEAM, SETTINGS]) {
  for (const [, source] of read(rel).matchAll(/from '([^']*components\/ui[^']*)'/g)) {
    assert.equal(
      source,
      '@/components/ui',
      `${rel} imports a primitive from "${source}" — import from the barrel so the primitive stays replaceable`
    );
  }
}
console.log('  ok  every control is Field-wrapped and every primitive comes from the barrel');

/* --- 8. No window.alert / window.confirm in the team flow --------------- */
// Removing a colleague is destructive and was behind a native confirm().
{
  const src = code(TEAM);
  for (const api of ['alert\\(', 'confirm\\(']) {
    assert.doesNotMatch(
      src,
      new RegExp(`(?<![.\\w])${api}`),
      `${TEAM} went back to a native ${api.replace('\\(', '()')} — invites use a toast and removal uses DeleteConfirmModal`
    );
  }
  assert.match(src, /DeleteConfirmModal/, `${TEAM} no longer confirms removal in a modal`);

  // The four team endpoints exist and their shapes are fixed. Changing a
  // method here fails silently: the UI just stops updating.
  for (const call of [
    "fetch\\('/api/team/members'\\)",
    "fetch\\('/api/team/invite', \\{\\s*method: 'POST'",
    "method: 'DELETE'",
    "method: 'PATCH'",
  ]) {
    assert.match(
      src,
      new RegExp(call),
      `${TEAM} changed the call shape for ${call} — the four team routes are live and their contracts are fixed`
    );
  }
}
console.log('  ok  team: no native alert/confirm, and the four API contracts are unchanged');

/* --- 9. Glass does not nest ------------------------------------------- */
// Rule 2: never two blurred surfaces directly. GlassPanel exists precisely so
// an inner group inside a GlassCard carries no blur of its own.
for (const rel of OWNED) {
  const src = read(rel);
  assert.doesNotMatch(
    src,
    /<GlassCard[^>]*\btier="(?:card|bright|modal|chrome|toast)"/,
    `${rel} nests a blurred GlassCard tier inside a page that already has one — use GlassPanel for inner groups`
  );
  for (const blurred of ['glass-card', 'glass-modal', 'glass-chrome', 'glass-toast']) {
    assert.doesNotMatch(
      src,
      new RegExp(`className="[^"]*\\b${blurred}\\b`),
      `${rel} applies .${blurred} by hand — the blur tiers belong to the primitives`
    );
  }
}
console.log('  ok  no hand-rolled or nested blur tiers');

console.log('\nall parcel D checks passed');
