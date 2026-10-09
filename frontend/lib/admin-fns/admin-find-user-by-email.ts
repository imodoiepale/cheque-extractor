import type { AdminFn } from './index';
import { str } from './_shared';

const findUserByEmail: AdminFn = async (body, { db }) => {
  const email = str(body.email)?.trim().toLowerCase();
  if (!email) throw new Error('email required');
  const { data, error } = await db.from('user_profiles').select('id, email, full_name, tenant_id, created_at')
    .ilike('email', email.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
  if (error) throw new Error('Lookup failed');
  if (!data) throw new Error('No user found with that email');
  return { user: data };
};

export default findUserByEmail;
