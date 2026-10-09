import type { AdminFn } from './index';
import { authUsers, isSuperAdminUser } from './_shared';

const listAdmins: AdminFn = async (_body, { db }) => {
  const users = await authUsers(db);
  const admins = [...users.values()]
    .filter((u) => isSuperAdminUser(u))
    .map((u) => ({ id: u.id, email: u.email ?? '', created_at: u.created_at }))
    .sort((a, b) => a.email.localeCompare(b.email));
  return { admins };
};

export default listAdmins;
