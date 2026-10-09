import type { AdminFn } from './index';
import { stripeGet, stripeOn } from './_shared';

const health: AdminFn = async (_body, { db }) => {
  const t0 = Date.now();
  const { error } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).limit(1);
  const dbOk = !error;
  const latencyMs = Date.now() - t0;

  let stripeOk = false;
  const s0 = Date.now();
  if (stripeOn()) {
    try { await stripeGet('/balance'); stripeOk = true; } catch { /* reported as ok:false */ }
  }

  return {
    ok: dbOk,
    db: { ok: dbOk, latencyMs },
    stripe: { ok: stripeOk, ...(stripeOk ? { latencyMs: Date.now() - s0 } : {}) },
    timestamp: new Date().toISOString(),
  };
};

export default health;
