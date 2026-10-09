// Super admin access control.
//
// A user is a super admin when either:
//  - their email is in SUPER_ADMIN_EMAILS (or the comma-separated
//    NEXT_PUBLIC_SUPER_ADMIN_EMAILS env var), or
//  - their auth app_metadata.role is 'super_admin', which only the service
//    role can set (admin console -> Settings / Users -> set role).
// Server routes must pass a user that came from auth.getUser(), never a
// decoded JWT, or app_metadata could be forged.
export const SUPER_ADMIN_EMAILS: string[] = [
  'michael@itaxhub.com',
  'ijepale@gmail.com',
  ...(process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
];

type MaybeUser = { email?: string | null; app_metadata?: Record<string, unknown> | null };

export function isSuperAdmin(who: string | MaybeUser | undefined | null): boolean {
  if (!who) return false;
  if (typeof who !== 'string' && who.app_metadata?.role === 'super_admin') return true;
  const email = typeof who === 'string' ? who : who.email;
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}
