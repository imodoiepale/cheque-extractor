/**
 * The role matrix, asserted. One runnable check for the whole roles parcel.
 *
 *   cd frontend && npx tsx lib/roles.check.ts
 *
 * Part 1 is pure logic and ALWAYS runs: for each role, for each protected
 * action, the expected allow/deny, plus the MFA rule and the invitation id
 * encoding.
 *
 * Part 2 needs a live database and SKIPS with a clear message when
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. It is
 * the RLS half: an anon-key request must return zero rows from the tables this
 * parcel added or locked down.
 */
import assert from 'assert';
import {
  can,
  mfaRequiredFor,
  productRole,
  productRoleLabel,
  toDbRole,
  ALL_CAPABILITIES,
  type Capability,
  type DbRole,
} from './roles';
import { decodeMemberId, encodeInviteId, isUuid, normaliseEmail } from './team-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the matrix. Written out longhand on purpose: a table that derives
// itself from CAPABILITIES would pass no matter what CAPABILITIES said.
// ─────────────────────────────────────────────────────────────────────────────
type Expect = Record<Capability, boolean>;

const ADMINISTRATOR: Expect = {
  'billing.view': true,
  'billing.manage': true,
  'reports.view': true,
  'reports.export': true,
  'account.edit': true,
  'team.view': true,
  'team.manage': true,
  'checks.view': true,
  'checks.upload': true,
  'checks.edit': true,
  'superadmin.view': false, // platform staff, not a tenant role
};

// The client's requirement: Users get no billing, no reports, no account editing.
const USER: Expect = {
  'billing.view': false,
  'billing.manage': false,
  'reports.view': false,
  'reports.export': false,
  'account.edit': false,
  'team.view': false,
  'team.manage': false,
  'checks.view': true,
  'checks.upload': true,
  'checks.edit': true,
  'superadmin.view': false,
};

// Legacy 'viewer' — a User who additionally cannot write.
const VIEWER: Expect = {
  ...USER,
  'checks.upload': false,
  'checks.edit': false,
};

const MATRIX: Record<DbRole, Expect> = {
  admin: ADMINISTRATOR,
  member: USER,
  viewer: VIEWER,
};

let checks = 0;
for (const role of Object.keys(MATRIX) as DbRole[]) {
  for (const capability of ALL_CAPABILITIES) {
    const expected = MATRIX[role][capability];
    assert.strictEqual(
      can(role, capability),
      expected,
      `${role} -> ${capability}: expected ${expected ? 'ALLOW' : 'DENY'}, got ${
        can(role, capability) ? 'ALLOW' : 'DENY'
      }`
    );
    checks++;
  }
}
assert.strictEqual(
  checks,
  3 * ALL_CAPABILITIES.length,
  'every role must be asserted against every capability'
);

// Every capability must appear in the expectation tables, so adding one to
// CAPABILITIES without deciding who may do it fails here.
for (const capability of ALL_CAPABILITIES) {
  assert.ok(
    capability in ADMINISTRATOR && capability in USER && capability in VIEWER,
    `capability ${capability} has no expected value in roles.check.ts`
  );
}

// Role mapping: Administrator <- 'admin'; User <- 'member' and 'viewer'.
assert.strictEqual(productRole('admin'), 'administrator');
assert.strictEqual(productRole('member'), 'user');
assert.strictEqual(productRole('viewer'), 'user');
assert.strictEqual(productRoleLabel('admin'), 'Administrator');
assert.strictEqual(productRoleLabel('viewer'), 'User');

// Unknown / hostile role values must fail closed to the least privilege, and
// must never be read as admin.
for (const junk of ['Admin', 'ADMIN', 'owner', 'superadmin', '', null, undefined, 0, {}, []]) {
  assert.strictEqual(toDbRole(junk as unknown), 'member', `junk role -> member: ${String(junk)}`);
  assert.strictEqual(can(junk as unknown, 'billing.manage'), false, `junk role must not get billing: ${String(junk)}`);
  assert.strictEqual(can(junk as unknown, 'team.manage'), false, `junk role must not manage team: ${String(junk)}`);
  assert.strictEqual(productRole(junk as unknown), 'user');
}

// An unknown capability denies rather than throwing.
assert.strictEqual(can('admin', 'does.not.exist' as Capability), false);

// MFA: mandatory for Administrators, optional for Users unless the firm opts in.
assert.strictEqual(mfaRequiredFor('admin'), true);
assert.strictEqual(mfaRequiredFor('member'), false);
assert.strictEqual(mfaRequiredFor('viewer'), false);
assert.strictEqual(mfaRequiredFor('member', true), true);
assert.strictEqual(mfaRequiredFor('admin', false), true);

// Invitation ids ride the same /api/team/members/[id] route as profile ids.
const inviteUuid = '11111111-2222-3333-4444-555555555555';
assert.strictEqual(encodeInviteId(inviteUuid), `invite_${inviteUuid}`);
assert.deepStrictEqual(decodeMemberId(encodeInviteId(inviteUuid)), {
  kind: 'invitation',
  id: inviteUuid,
});
assert.deepStrictEqual(decodeMemberId(inviteUuid), { kind: 'profile', id: inviteUuid });
assert.ok(isUuid(inviteUuid));
assert.ok(!isUuid('invite_' + inviteUuid), 'the prefix must be stripped before the uuid check');
assert.ok(!isUuid("' OR 1=1 --"), 'junk ids must be rejected before any query');

// Email normalisation at the invite trust boundary.
assert.strictEqual(normaliseEmail('  Someone@Example.COM '), 'someone@example.com');
for (const bad of ['', 'nope', 'a@b', '@example.com', 'a b@example.com', null, 42]) {
  assert.strictEqual(normaliseEmail(bad as unknown), null, `bad email rejected: ${String(bad)}`);
}

console.log(`roles: ${checks} role/capability assertions passed (pure logic)`);

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — RLS. Needs a live database.
// ─────────────────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log(
    'roles: SKIPPING the RLS half — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. `npx dotenv -e .env -- npx tsx lib/roles.check.ts`) ' +
      'to assert that an anon-key request returns zero rows.'
  );
} else {
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });

    // Every table this parcel added or locked down. An unauthenticated caller
    // must see nothing in all of them.
    const closedTables = [
      'team_invitations',
      'mfa_recovery_codes',
      'user_profiles',
      'tenants',
      'audit_logs',
      // Held a gemini_api_key and QBO tokens readable with the public anon key
      // until migration 030 closed it. Only the backend's service key reads it.
      'app_settings',
    ];

    // A table that does not exist also returns zero rows. That is NOT proof
    // that RLS holds, so it is reported as SKIPPED rather than counted as a
    // pass — otherwise this check would go green on a database where migration
    // 030 had never been applied.
    const MISSING = /PGRST205|42P01/;

    let failures = 0;
    let skipped: string[] = [];
    for (const table of closedTables) {
      const { data, error } = await anon.from(table).select('*').limit(5);
      const rows = data?.length ?? 0;
      const code = String(error?.code || '');

      if (MISSING.test(code)) {
        skipped.push(table);
        console.log(`roles: SKIP ${table} — table not present in this database (${code})`);
      } else if (rows > 0) {
        failures++;
        console.error(`roles: FAIL ${table} returned ${rows} row(s) to the anon key`);
      } else {
        console.log(`roles: ok ${table} -> 0 rows for anon${code ? ` (${code})` : ''}`);
      }
    }

    // Writes must fail too, not just reads.
    const { error: writeErr } = await anon.from('team_invitations').insert({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      email: 'rls-probe@example.com',
      role: 'admin',
    });
    if (MISSING.test(String(writeErr?.code || ''))) {
      console.log('roles: SKIP anon insert probe — team_invitations not present');
    } else if (!writeErr) {
      failures++;
      console.error('roles: FAIL anon key was able to insert a team_invitation');
    } else {
      console.log(
        `roles: ok anon insert into team_invitations rejected (${writeErr.code || writeErr.message})`
      );
    }

    if (failures > 0) {
      console.error(`roles: ${failures} RLS check(s) FAILED`);
      process.exit(1);
    }
    if (skipped.length > 0) {
      console.log(
        `roles: RLS checks passed for the tables that exist; ${skipped.length} skipped ` +
          `(${skipped.join(', ')}) — apply supabase/migrations/030_roles_team_rls_and_mfa.sql ` +
          'and re-run to cover them.'
      );
    } else {
      console.log('roles: RLS checks passed');
    }
  })().catch((err) => {
    console.error('roles: RLS half errored:', err?.message || err);
    process.exit(1);
  });
}
