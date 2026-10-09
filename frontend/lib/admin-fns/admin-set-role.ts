import type { AdminFn } from './index';
import { audit, str } from './_shared';

/** "admin" here means Kyriq super admin, stored as auth app_metadata.role. */
const setRole: AdminFn = async (body, ctx) => {
  const id = str(body.targetUserId);
  const role = body.role ?? null;
  if (!id) throw new Error('targetUserId required');
  if (role !== 'admin' && role !== null) throw new Error("role must be 'admin' or null");
  if (id === ctx.user.id && role === null) throw new Error('You cannot remove your own admin access.');

  const { data: u, error: gErr } = await ctx.db.auth.admin.getUserById(id);
  if (gErr || !u.user) throw new Error('User not found');
  const { error } = await ctx.db.auth.admin.updateUserById(id, {
    app_metadata: { ...u.user.app_metadata, role: role === 'admin' ? 'super_admin' : null },
  });
  if (error) throw new Error(error.message);

  await audit(ctx, role ? 'admin.user.promote' : 'admin.user.demote', { target_user_id: id, target_email: u.user.email });
  return { ok: true };
};

export default setRole;
