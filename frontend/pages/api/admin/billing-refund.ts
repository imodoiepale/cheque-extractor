import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { isSuperAdmin } from '@/lib/super-admin';
import { stripeConfig, stripeRequest, StripeError, idOf } from '@/lib/billing/stripe';
import { isMissingSchema, service } from '@/lib/billing/service';

/**
 * /api/admin/billing-refund — "Refunds require an authorised Super Admin action
 * with a recorded reason" (CHECKLIST section 7).
 *
 *   GET  ?tenantId=        refunds already issued
 *   POST { tenantId, invoiceId, reason, amountMinor? }   issue one
 *
 * Three gates, same shape as /api/admin/comp-accounts:
 *   1. a valid session (getAuthContext)
 *   2. the Super Admin email allowlist (lib/super-admin.ts) — no tenant role
 *      grants this, including Administrator
 *   3. RLS — billing_refunds has no write policy for `authenticated` and
 *      INSERT/UPDATE/DELETE are revoked, so this write only works through the
 *      service client
 *
 * The reason is enforced twice: here, so the caller gets a useful 400, and by a
 * CHECK constraint on the table, so a future caller that skips this route still
 * cannot write a blank one. The audit entry is written by a TRIGGER on
 * billing_refunds, not by this file — a refund cannot be issued unlogged.
 *
 * Partial refunds are allowed (amountMinor); omitting it refunds the full
 * amount paid on the invoice.
 */
const MIN_REASON = 3;

async function requireSuperAdmin(req: NextApiRequest, res: NextApiResponse) {
  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    res.status(401).json({ error: 'unauthenticated', message: err?.message });
    return null;
  }
  if (!isSuperAdmin(ctx.email)) {
    res.status(403).json({ error: 'forbidden', message: 'Super Admin only.' });
    return null;
  }
  return ctx;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireSuperAdmin(req, res);
  if (!ctx) return;

  const svc = service();

  if (req.method === 'GET') {
    let query = svc
      .from('billing_refunds')
      .select('id, tenant_id, refunded_by_email, reason, stripe_refund_id, stripe_invoice_id, amount, currency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (typeof req.query.tenantId === 'string' && req.query.tenantId) {
      query = query.eq('tenant_id', req.query.tenantId);
    }
    const { data, error } = await query;
    if (error) {
      if (isMissingSchema(error)) {
        return res.status(409).json({ error: 'billing_schema_missing', message: error.message, refunds: [] });
      }
      return res.status(500).json({ error: 'server_error', message: error.message });
    }
    return res.status(200).json({ refunds: data || [] });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { tenantId, invoiceId, reason, amountMinor } = (req.body || {}) as {
    tenantId?: string;
    invoiceId?: string;
    reason?: string;
    amountMinor?: number;
  };

  if (!tenantId || typeof tenantId !== 'string') {
    return res.status(400).json({ error: 'tenant_required' });
  }
  if (!invoiceId || typeof invoiceId !== 'string') {
    return res.status(400).json({ error: 'invoice_required', message: 'Refunds are issued against a Stripe invoice.' });
  }
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (cleanReason.length < MIN_REASON) {
    return res.status(400).json({
      error: 'reason_required',
      message: `A refund needs a recorded reason of at least ${MIN_REASON} characters.`,
    });
  }
  if (amountMinor !== undefined && (!Number.isInteger(amountMinor) || amountMinor <= 0)) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amountMinor must be a positive whole number of cents.' });
  }

  const cfg = stripeConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'stripe_not_configured', message: cfg.reason, missing: cfg.missing });
  }

  try {
    // The invoice must be one WE recorded for THAT tenant. Refunding by a raw
    // Stripe id with a tenant id attached by hand would let a typo refund one
    // firm's invoice and log it against another.
    const { data: invoice, error: invoiceError } = await svc
      .from('billing_invoices')
      .select('stripe_invoice_id, tenant_id, amount_paid, currency, status')
      .eq('stripe_invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (invoiceError && !isMissingSchema(invoiceError)) throw invoiceError;
    if (!invoice) {
      return res.status(404).json({
        error: 'invoice_not_found',
        message: 'No recorded invoice with that id for that firm.',
      });
    }
    if (!invoice.amount_paid || invoice.amount_paid <= 0) {
      return res.status(409).json({
        error: 'nothing_to_refund',
        message: `Invoice ${invoiceId} has no settled amount (status ${invoice.status}).`,
      });
    }

    const amount = amountMinor ?? invoice.amount_paid;
    if (amount > invoice.amount_paid) {
      return res.status(409).json({
        error: 'amount_exceeds_payment',
        message: `Invoice ${invoiceId} settled ${invoice.amount_paid}; cannot refund ${amount}.`,
      });
    }

    // The charge/payment intent lives on the live Stripe invoice, not in our
    // mirror, so it is read at refund time.
    const stripeInvoice = await stripeRequest<any>(`/v1/invoices/${invoiceId}`, { method: 'GET', config: cfg });
    const paymentIntent = idOf(stripeInvoice?.payment_intent) ?? idOf(stripeInvoice?.payments?.data?.[0]?.payment?.payment_intent);
    const charge = idOf(stripeInvoice?.charge);
    if (!paymentIntent && !charge) {
      return res.status(409).json({
        error: 'no_payment_to_refund',
        message: 'Stripe reports no charge or payment intent on that invoice.',
      });
    }

    const refund = await stripeRequest<any>('/v1/refunds', {
      config: cfg,
      // Same invoice + same amount twice is one refund, not two.
      idempotencyKey: `refund-${invoiceId}-${amount}`,
      params: {
        payment_intent: paymentIntent || undefined,
        charge: paymentIntent ? undefined : charge,
        amount,
        metadata: {
          tenant_id: tenantId,
          stripe_invoice_id: invoiceId,
          reason: cleanReason,
          issued_by: ctx.email || ctx.userId,
        },
      },
    });

    // Recorded after Stripe succeeds, so the ledger cannot claim a refund that
    // did not happen. The trigger on this table writes the audit entry.
    const { data: row, error: insertError } = await svc
      .from('billing_refunds')
      .insert({
        tenant_id: tenantId,
        refunded_by: ctx.userId,
        refunded_by_email: ctx.email || 'unknown',
        reason: cleanReason,
        stripe_refund_id: refund?.id ?? null,
        stripe_invoice_id: invoiceId,
        stripe_charge_id: charge,
        stripe_payment_intent_id: paymentIntent,
        amount,
        currency: refund?.currency || invoice.currency || 'usd',
        status: refund?.status ?? null,
      })
      .select()
      .single();

    if (insertError) {
      // The money has moved; losing the record is worse than a 500 here.
      console.error('[admin/billing-refund] refund succeeded but was not recorded:', insertError.message, refund?.id);
      return res.status(500).json({
        error: 'refund_not_recorded',
        message: `Stripe refund ${refund?.id} succeeded but could not be recorded: ${insertError.message}`,
        stripeRefundId: refund?.id ?? null,
      });
    }

    return res.status(201).json({ refund: row, stripeStatus: refund?.status ?? null });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[admin/billing-refund]', err?.message || err);
    return res.status(status).json({ error: 'refund_failed', message: err?.message || 'Refund failed.' });
  }
}
