import type { AdminFn } from './index';
import { stripeGet, stripeOn } from './_shared';

const PATHS: Record<string, string> = {
  charges: '/charges', invoices: '/invoices', subscriptions: '/subscriptions', refunds: '/refunds',
  customers: '/customers', disputes: '/disputes', payouts: '/payouts', balance: '/balance',
};
const toUnix = (v: string | null) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);

const stripeQuery: AdminFn = async (body, { db }) => {
  const resource = String(body.resource ?? '');
  const path = PATHS[resource];
  if (!path) throw new Error('Unknown resource');
  // DepthMe nests options under `params`; the copied screens also pass `limit` at the top level.
  const params = { ...((body.params as Record<string, unknown> | undefined) ?? {}) };
  const limit = Math.min(Number(params.limit ?? body.limit) || 50, 100);

  if (stripeOn()) {
    if (resource === 'balance') return stripeGet(path);
    return stripeGet(path, { ...params, limit, ...(resource === 'charges' ? { expand: ['data.customer'] } : {}) });
  }

  // Stripe not configured: serve Kyriq's webhook mirrors where they exist.
  if (resource === 'balance') return { object: 'balance', available: [], pending: [] };
  if (resource === 'invoices') {
    const { data, error } = await db.from('billing_invoices')
      .select('stripe_invoice_id, stripe_customer_id, stripe_subscription_id, number, status, currency, amount_due, amount_paid, amount_remaining, total, hosted_invoice_url, invoice_pdf, paid_at, created_at')
      .order('created_at', { ascending: false }).limit(limit + 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return {
      object: 'list', has_more: rows.length > limit, source: 'billing_invoices',
      data: rows.slice(0, limit).map((r) => ({
        id: r.stripe_invoice_id, object: 'invoice', customer: r.stripe_customer_id, subscription: r.stripe_subscription_id,
        number: r.number, status: r.status, currency: r.currency, amount_due: r.amount_due, amount_paid: r.amount_paid,
        amount_remaining: r.amount_remaining, total: r.total, hosted_invoice_url: r.hosted_invoice_url,
        invoice_pdf: r.invoice_pdf, created: toUnix(r.created_at as string), status_transitions: { paid_at: toUnix(r.paid_at as string | null) },
      })),
    };
  }
  if (resource === 'refunds') {
    const { data, error } = await db.from('billing_refunds')
      .select('stripe_refund_id, stripe_charge_id, stripe_payment_intent_id, amount, currency, status, reason, created_at')
      .order('created_at', { ascending: false }).limit(limit + 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return {
      object: 'list', has_more: rows.length > limit, source: 'billing_refunds',
      data: rows.slice(0, limit).map((r) => ({
        id: r.stripe_refund_id, object: 'refund', charge: r.stripe_charge_id, payment_intent: r.stripe_payment_intent_id,
        amount: r.amount, currency: r.currency, status: r.status, reason: r.reason, created: toUnix(r.created_at as string),
      })),
    };
  }
  return { object: 'list', data: [], has_more: false, source: 'stripe_not_configured' };
};

export default stripeQuery;
