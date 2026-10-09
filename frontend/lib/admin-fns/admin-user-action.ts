import type { AdminFn } from './index';
import { audit, str } from './_shared';

const userAction: AdminFn = async (body, ctx) => {
  const id = str(body.targetUserId) ?? str(body.userId);
  const action = str(body.action);
  if (!id || !action) throw new Error('userId and action required');
  if (id === ctx.user.id && action !== 'reset_password') throw new Error('You cannot run this action on yourself.');
  const { db } = ctx;

  let message: string;
  let link: string | undefined;
  switch (action) {
    case 'suspend':
    case 'unsuspend': {
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === 'suspend' ? '876000h' : 'none' });
      if (error) throw new Error(error.message);
      message = action === 'suspend' ? 'User suspended' : 'User unsuspended';
      break;
    }
    case 'reset_password': {
      const { data: u, error: uErr } = await db.auth.admin.getUserById(id);
      if (uErr || !u.user?.email) throw new Error('User has no email');
      const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email: u.user.email });
      if (error) throw new Error(error.message);
      link = data.properties?.action_link;
      message = 'Password reset link generated (not emailed). Copy it from the response.';
      break;
    }
    case 'delete':
      throw new Error('Deleting users is disabled: Kyriq usage and billing ledgers are ON DELETE RESTRICT. Suspend instead.');
    default:
      throw new Error('Unknown action');
  }

  await audit(ctx, `admin.user.${action}`, { target_user_id: id, reason: str(body.reason) ?? null });
  return { ok: true, message, ...(link ? { link } : {}) };
};

export default userAction;
