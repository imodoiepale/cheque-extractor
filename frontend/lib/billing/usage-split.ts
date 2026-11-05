/**
 * Which usage_ledger rows Stripe should bill.
 *
 * The overage price is a flat rate per metered unit, so only cheques above the
 * monthly allowance may be sent. Everything else is stamped, so the reporter
 * doesn't read it again, and never reaches Stripe.
 */
export interface UsageRow {
  id: string;
  quantity: number | null;
  occurred_at: string;
  billing_period_start: string;
  stripe_event_id: string | null;
}

export interface CompWindow {
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface TenantBilling {
  /** Included cheques per period. Null means the plan's allowance is unknown. */
  allowance: number | null;
  subscriptionStartedAt: string | null;
  compGrants: CompWindow[];
}

export type NotBilled = 'included' | 'trial' | 'comp';
export type UsageDecision =
  | { id: string; action: 'meter'; units: number }
  | { id: string; action: 'stamp'; stamp: NotBilled }
  | { id: string; action: 'hold' }; // unknown allowance: neither bill nor write off

const time = (iso: string) => new Date(iso).getTime();

function notBillable(row: UsageRow, tenant: TenantBilling): 'trial' | 'comp' | null {
  const at = time(row.occurred_at);
  if (!tenant.subscriptionStartedAt || at < time(tenant.subscriptionStartedAt)) return 'trial';
  const comped = tenant.compGrants.some((g) =>
    at >= time(g.starts_at) && at < time(g.expires_at) && (!g.revoked_at || at < time(g.revoked_at))
  );
  return comped ? 'comp' : null;
}

/**
 * Pass every ledger row in the affected billing periods, stamped or not.
 * Returns a decision for each unstamped row, oldest first.
 *
 * Rows already reported or marked included count as used. Pending rows are then
 * added on top, so a period's total metered units always equal total usage minus
 * the allowance, even when a run stops partway or a row arrives late.
 *
 * ponytail: uses the tenant's current allowance for every period, so a plan
 * change mid-month applies to the rest of that month and not to already-stamped
 * rows. Upgrade path: record the allowance on the ledger row at write time.
 */
export function splitUsage(rows: UsageRow[], tenant: TenantBilling): UsageDecision[] {
  const usedByPeriod = new Map<string, number>();
  const add = (row: UsageRow) => {
    const before = usedByPeriod.get(row.billing_period_start) ?? 0;
    const after = before + (row.quantity ?? 1);
    usedByPeriod.set(row.billing_period_start, after);
    return { before, after };
  };

  for (const row of rows) {
    if (row.stripe_event_id && row.stripe_event_id !== 'trial' && row.stripe_event_id !== 'comp' && !notBillable(row, tenant)) {
      add(row);
    }
  }

  const pending = rows
    .filter((r) => !r.stripe_event_id)
    .sort((a, b) => time(a.occurred_at) - time(b.occurred_at) || a.id.localeCompare(b.id));

  return pending.map((row): UsageDecision => {
    const excluded = notBillable(row, tenant);
    if (excluded) return { id: row.id, action: 'stamp', stamp: excluded };
    if (tenant.allowance == null) return { id: row.id, action: 'hold' };

    const { before, after } = add(row);
    const units = Math.max(0, after - tenant.allowance) - Math.max(0, before - tenant.allowance);
    return units > 0
      ? { id: row.id, action: 'meter', units }
      : { id: row.id, action: 'stamp', stamp: 'included' };
  });
}
