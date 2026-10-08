import crypto from 'crypto';

/**
 * Signed OAuth `state` for the QuickBooks connect flow.
 *
 * The state carries the tenant_id that the callback writes tokens against, so an
 * attacker who can forge it can attach their QuickBooks company to another firm.
 * It is therefore HMAC-signed on the way out and verified on the way back in.
 *
 * Format: base64url(JSON payload) + "." + hex HMAC-SHA256 of that base64url string.
 */

export interface QboState {
  random: string;
  tenant_id: string;
  user_id: string;
  source: string;
  timestamp: number;
}

/** Max age of a state parameter, matching the qbo_state cookie's Max-Age. */
const MAX_AGE_MS = 10 * 60 * 1000;

function secret(): string {
  // QBO_STATE_SECRET is preferred; the service role key is always present
  // server-side, so the flow stays signed without extra configuration.
  const s = process.env.QBO_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('QBO_STATE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to sign OAuth state');
  return s;
}

function mac(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('hex');
}

export function signState(payload: QboState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

/** Parse the payload WITHOUT verifying. Only for picking an error redirect target. */
export function peekState(state: unknown): Partial<QboState> | null {
  if (typeof state !== 'string') return null;
  const body = state.split('.')[0];
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

export type VerifyResult =
  | { ok: true; payload: QboState }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyState(state: unknown): VerifyResult {
  if (typeof state !== 'string') return { ok: false, reason: 'malformed' };

  const dot = state.lastIndexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };

  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = mac(body);

  // Lengths must match before timingSafeEqual, which throws on a length mismatch.
  if (sig.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: QboState;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!payload?.tenant_id) return { ok: false, reason: 'malformed' };
  if (typeof payload.timestamp !== 'number' || Date.now() - payload.timestamp > MAX_AGE_MS) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}
