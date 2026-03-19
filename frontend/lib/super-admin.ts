// Super admin access control
// Add your admin email addresses here
export const SUPER_ADMIN_EMAILS: string[] = [
  'michael@itaxhub.com',
];

export function isSuperAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}
