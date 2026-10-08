/**
 * Minimal Stripe client — `fetch` plus `node:crypto`, no SDK.
 *
 * ponytail: the `stripe` npm package is ~2 MB of code to make form-encoded
 * POSTs and one HMAC comparison, and this repo's rule is no new dependency if
 * it can be avoided. Ceiling, named so the upgrade path is obvious: no typed
 * response objects, no automatic retry/backoff, and no auto-pagination — the
 * callers here fetch single objects and at most one page of invoices. If this
 * grows a second pagination loop or needs Connect, install `stripe` and
 * replace this file; the call sites only use stripeRequest().
 *
 * Two things in here are security-critical and are written out rather than
 * assumed:
 *
 *  1. verifyStripeSignature() implements Stripe's documented v1 scheme —
 *     HMAC-SHA256 over `${timestamp}.${rawBody}`, compared in constant time,
 *     with a replay tolerance. An unverified webhook body is an attacker
 *     telling us a firm has paid.
 *  2. Nothing in this module reads a price id from a request. Price ids come
 *     from the environment (lib/billing/plans.ts) only.
 */
import crypto from 'node:crypto';
import type { NextApiRequest } from 'next';
import { requiredPriceEnvVars, type StripeEnv } from './plans';

const API_BASE = 'https://api.stripe.com';

/** Pinned so a Stripe account-level API upgrade cannot silently reshape payloads. */
export const STRIPE_API_VERSION = '2025-03-31.basil';

export class StripeError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.code = code;
  }
}

export interface StripeConfig {
  configured: boolean;
  env: StripeEnv;
  secretKey: string | null;
  webhookSecret: string | null;
  /** Environment variables that are required but absent. */
  missing: string[];
  /** Human-readable reason the integration is unusable, or null. */
  reason: string | null;
}

/**
 * Which Stripe environment the keys belong to.
 *
 * Derived from the secret key rather than trusted from STRIPE_ENV: a mislabelled
 * STRIPE_ENV with live keys would charge real cards against test price ids. If
 * STRIPE_ENV is set and disagrees, the integration reports itself unconfigured
 * instead of picking one.
 */
export function stripeEnvFromKey(secretKey: string | null | undefined): StripeEnv | null {
  const key = (secretKey || '').trim();
  if (!key) return null;
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  return null;
}

export function stripeConfig(source: Record<string, string | undefined> = process.env as any): StripeConfig {
  const secretKey = (source.STRIPE_SECRET_KEY || '').trim() || null;
  const webhookSecret = (source.STRIPE_WEBHOOK_SECRET || '').trim() || null;
  const declared = (source.STRIPE_ENV || '').trim().toLowerCase();
  const derived = stripeEnvFromKey(secretKey);

  const missing: string[] = [];
  if (!secretKey) missing.push('STRIPE_SECRET_KEY');
  if (!webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');

  if (!secretKey || !derived) {
    return {
      configured: false,
      env: derived || 'test',
      secretKey,
      webhookSecret,
      missing,
      reason: secretKey
        ? 'STRIPE_SECRET_KEY is not a recognisable sk_test_/sk_live_ key.'
        : 'STRIPE_SECRET_KEY is not set.',
    };
  }

  if (declared && declared !== derived) {
    return {
      configured: false,
      env: derived,
      secretKey,
      webhookSecret,
      missing,
      reason: `STRIPE_ENV says "${declared}" but STRIPE_SECRET_KEY is a ${derived} key. Refusing to guess.`,
    };
  }

  for (const name of requiredPriceEnvVars(derived)) {
    if (!(source[name] || '').trim()) missing.push(name);
  }

  return {
    configured: missing.length === 0,
    env: derived,
    secretKey,
    webhookSecret,
    missing,
    reason: missing.length ? `Missing environment variables: ${missing.join(', ')}` : null,
  };
}

/* ─────────────────────────── form encoding ─────────────────────────────── */

/**
 * Stripe takes `application/x-www-form-urlencoded` with bracketed paths:
 *   { items: [{ price: 'p' }] }  ->  items[0][price]=p
 * `undefined` and `null` values are dropped, so callers can pass optional
 * fields without building the object conditionally.
 */
export function toForm(value: any, prefix = '', out: URLSearchParams = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return out;

  if (Array.isArray(value)) {
    value.forEach((item, i) => toForm(item, prefix ? `${prefix}[${i}]` : String(i), out));
    return out;
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      toForm(v, prefix ? `${prefix}[${k}]` : k, out);
    }
    return out;
  }

  out.append(prefix, value instanceof Date ? String(Math.floor(value.getTime() / 1000)) : String(value));
  return out;
}

export interface StripeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Body for POST, query string for GET. */
  params?: Record<string, any>;
  /** Stripe-side idempotency. Always pass one for a POST that creates money movement. */
  idempotencyKey?: string;
  /** Override the pinned API version (the v2 meter-events endpoint needs none). */
  apiVersion?: string | null;
  config?: StripeConfig;
}

export async function stripeRequest<T = any>(
  path: string,
  { method = 'POST', params, idempotencyKey, apiVersion = STRIPE_API_VERSION, config }: StripeRequestOptions = {}
): Promise<T> {
  const cfg = config ?? stripeConfig();
  if (!cfg.secretKey) {
    throw new StripeError(cfg.reason || 'Stripe is not configured.', 503, 'stripe_not_configured');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
  };
  if (apiVersion) headers['Stripe-Version'] = apiVersion;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let url = `${API_BASE}${path}`;
  let body: string | undefined;

  if (method === 'GET') {
    const qs = toForm(params ?? {}).toString();
    if (qs) url += `?${qs}`;
  } else if (params) {
    body = toForm(params).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* Stripe always sends JSON; a non-JSON body means a proxy or an outage. */
  }

  if (!res.ok) {
    const err = json?.error || {};
    throw new StripeError(
      err.message || `Stripe ${method} ${path} failed with ${res.status}`,
      res.status,
      err.code || err.type || null
    );
  }

  return json as T;
}

/* ────────────────────────── webhook signatures ─────────────────────────── */

/** Stripe's default replay window. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verify a `Stripe-Signature` header against the RAW request body.
 *
 * Throws on every failure rather than returning false, so a caller cannot
 * accidentally treat a falsy return as "fine". The header looks like
 *   t=1699999999,v1=<hex>,v1=<hex>
 * and several v1 signatures appear while a signing secret is being rotated —
 * any one matching is a pass.
 */
export function verifyStripeSignature(
  rawBody: Buffer | string,
  signatureHeader: string | string[] | undefined,
  secret: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS
): { timestamp: number } {
  if (!secret) throw new StripeError('STRIPE_WEBHOOK_SECRET is not set.', 503, 'webhook_secret_missing');

  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header) throw new StripeError('Missing Stripe-Signature header.', 400, 'signature_missing');

  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim());
    if (k === 't' && v) timestamp = Number(v);
    if (k === 'v1' && v) candidates.push(v);
  }

  if (!timestamp || !Number.isFinite(timestamp)) {
    throw new StripeError('Stripe-Signature has no usable timestamp.', 400, 'signature_malformed');
  }
  if (candidates.length === 0) {
    throw new StripeError('Stripe-Signature has no v1 signature.', 400, 'signature_malformed');
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    // A replayed old event is how a cancelled subscription gets re-activated.
    throw new StripeError('Stripe-Signature timestamp outside tolerance.', 400, 'signature_expired');
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  const ok = candidates.some((candidate) => {
    const given = Buffer.from(candidate, 'utf8');
    // timingSafeEqual throws on a length mismatch, which is itself a fail.
    return given.length === expectedBuf.length && crypto.timingSafeEqual(given, expectedBuf);
  });

  if (!ok) throw new StripeError('Stripe signature does not match.', 400, 'signature_invalid');
  return { timestamp };
}

/** Read the untouched body. Requires `api: { bodyParser: false }` on the route. */
export async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/* ──────────────────────────── meter events ─────────────────────────────── */

export const METER_EVENT_NAME =
  (process.env.STRIPE_METER_EVENT_NAME || '').trim() || 'kyriq_checks_processed';

/**
 * Report one billable cheque to Stripe.
 *
 * `identifier` is Stripe's own deduplication key, and we pass the usage_ledger
 * row id. So the row is reported exactly once even if we report it, fail to
 * stamp it locally, and report it again on the next run — which is the only
 * failure mode this ordering has.
 */
export async function sendMeterEvent(args: {
  customerId: string;
  identifier: string;
  value?: number;
  occurredAt?: Date;
  config?: StripeConfig;
}): Promise<any> {
  return stripeRequest('/v1/billing/meter_events', {
    method: 'POST',
    config: args.config,
    params: {
      event_name: METER_EVENT_NAME,
      identifier: args.identifier,
      timestamp: args.occurredAt ? Math.floor(args.occurredAt.getTime() / 1000) : undefined,
      payload: {
        stripe_customer_id: args.customerId,
        value: String(args.value ?? 1),
      },
    },
  });
}

/* ─────────────────────────────── helpers ───────────────────────────────── */

/** Stripe sends epoch seconds; Postgres wants an ISO string. */
export function stripeTime(seconds: unknown): string | null {
  const n = typeof seconds === 'string' ? Number(seconds) : seconds;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/** An expandable Stripe field is either an id string or the expanded object. */
export function idOf(value: any): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}
