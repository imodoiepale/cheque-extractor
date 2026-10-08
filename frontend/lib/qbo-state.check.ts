/**
 * Self-check for the signed QuickBooks OAuth state.
 * Run: npx tsx lib/qbo-state.check.ts   (or ts-node)
 */
process.env.QBO_STATE_SECRET = 'test-secret-for-selfcheck';

import assert from 'assert';
import { signState, verifyState, peekState } from './qbo-state';

const payload = {
  random: 'abc123',
  tenant_id: 'tenant-A',
  user_id: 'user-1',
  source: 'web',
  timestamp: Date.now(),
};

// Round trip
const state = signState(payload);
const ok = verifyState(state);
assert(ok.ok, 'a freshly signed state must verify');
assert.strictEqual(ok.payload.tenant_id, 'tenant-A');

// The attack the fix exists for: swap the tenant_id and re-encode the body.
const [body] = state.split('.');
const tampered = JSON.parse(Buffer.from(body, 'base64url').toString());
tampered.tenant_id = 'victim-tenant';
const forged = Buffer.from(JSON.stringify(tampered)).toString('base64url') + '.' + state.split('.')[1];
const bad = verifyState(forged);
assert(!bad.ok && bad.reason === 'bad_signature', 'a re-encoded payload must be rejected');

// A plain base64 state, which is what the old code accepted unconditionally.
const legacy = Buffer.from(JSON.stringify(payload)).toString('base64');
assert(!verifyState(legacy).ok, 'an unsigned legacy state must be rejected');

// Expiry
const stale = verifyState(signState({ ...payload, timestamp: Date.now() - 11 * 60 * 1000 }));
assert(!stale.ok && stale.reason === 'expired', 'a state older than 10 minutes must be rejected');

// Malformed input must not throw.
for (const junk of ['', '.', 'nodot', 'a.b', null, undefined, 123]) {
  assert(!verifyState(junk as unknown).ok, `junk state must be rejected: ${String(junk)}`);
}

// peekState reads the source without verifying, and tolerates junk.
assert.strictEqual(peekState(state)?.source, 'web');
assert.strictEqual(peekState('garbage'), null);

console.log('qbo-state: all checks passed');
