/**
 * Roles — single source of truth for the two product roles.
 *
 * The client asked for two roles: Administrator and User. The database already
 * had `user_profiles.role` with 'admin' | 'member' | 'viewer', so the product
 * roles are MAPPED onto that column rather than adding a parallel one:
 *
 *   Administrator  <-  'admin'
 *   User           <-  'member'   (and legacy 'viewer', read-only)
 *
 * 'viewer' is kept because rows already exist with it and the team page offers
 * it. A viewer is a User who additionally cannot write.
 *
 * Users get no billing, no reports and no account editing. That is expressed
 * once, here, in CAPABILITIES, and consumed by:
 *   - every /api/team/* and /api/auth/mfa/* route via requireCapability()
 *   - the RLS restrictive policies in supabase/migrations/030_*.sql
 *   - lib/roles.check.ts, which asserts the matrix
 */

export type DbRole = 'admin' | 'member' | 'viewer';
export type ProductRole = 'administrator' | 'user';

export const DB_ROLES: DbRole[] = ['admin', 'member', 'viewer'];

export function isDbRole(value: unknown): value is DbRole {
  return typeof value === 'string' && (DB_ROLES as string[]).includes(value);
}

/** Normalise anything out of the database into a role we can reason about. */
export function toDbRole(value: unknown): DbRole {
  return isDbRole(value) ? value : 'member';
}

export function productRole(role: unknown): ProductRole {
  return toDbRole(role) === 'admin' ? 'administrator' : 'user';
}

export function productRoleLabel(role: unknown): string {
  return productRole(role) === 'administrator' ? 'Administrator' : 'User';
}

/**
 * Protected actions. Named after what they protect, not after a route, so one
 * capability can gate several endpoints.
 */
export type Capability =
  // billing
  | 'billing.view'
  | 'billing.manage'
  // reports
  | 'reports.view'
  | 'reports.export'
  // account editing (firm settings, QB credentials, company connections)
  | 'account.edit'
  // team management
  | 'team.view'
  | 'team.manage'
  // day-to-day cheque work
  | 'checks.view'
  | 'checks.upload'
  | 'checks.edit'
  // super admin surface
  | 'superadmin.view';

/** capability -> the db roles allowed to perform it. */
export const CAPABILITIES: Record<Capability, DbRole[]> = {
  'billing.view': ['admin'],
  'billing.manage': ['admin'],

  'reports.view': ['admin'],
  'reports.export': ['admin'],

  'account.edit': ['admin'],

  'team.view': ['admin'],
  'team.manage': ['admin'],

  'checks.view': ['admin', 'member', 'viewer'],
  'checks.upload': ['admin', 'member'],
  'checks.edit': ['admin', 'member'],

  // Super Admin is platform staff, not a tenant role. No tenant role grants it;
  // it is gated separately by lib/super-admin.ts.
  'superadmin.view': [],
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

/** The one predicate. Pure, so lib/roles.check.ts can assert every cell. */
export function can(role: unknown, capability: Capability): boolean {
  const allowed = CAPABILITIES[capability];
  if (!allowed) return false; // unknown capability -> deny
  return allowed.includes(toDbRole(role));
}

/** MFA is mandatory for Administrators (CHECKLIST.md section 5). */
export function mfaRequiredFor(role: unknown, tenantRequiresAll = false): boolean {
  return toDbRole(role) === 'admin' || tenantRequiresAll === true;
}
