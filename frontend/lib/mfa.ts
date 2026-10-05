import crypto from 'crypto';

/**
 * MFA recovery-code helpers. Server-only (node crypto).
 *
 * Supabase TOTP ships no backup codes, so these are ours. Only the SHA-256
 * hash is stored, in mfa_recovery_codes, which migration 030 closes to both
 * `anon` and `authenticated` with a restrictive USING (false) policy.
 */

export const RECOVERY_CODE_COUNT = 10;

/** Unambiguous alphabet: no O/0, I/1, L. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRecoveryCode() {
  const bytes = crypto.randomBytes(10);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** Case- and separator-insensitive, so a user retyping a code still matches. */
export function hashRecoveryCode(code: string) {
  return crypto
    .createHash('sha256')
    .update(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
}
