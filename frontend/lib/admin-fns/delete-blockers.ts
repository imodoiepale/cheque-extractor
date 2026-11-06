/**
 * Why an account may not be deleted. Billing records and trial claims must outlive
 * a firm (migrations 027, 033, 037), so a firm that has any is suspended instead.
 */
export interface DeleteFacts {
  isSuperAdmin: boolean;
  otherMembers: number;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  usageRows: number;
  invoices: number;
  refunds: number;
  trialClaims: number;
}

export function deleteBlockers(f: DeleteFacts): string[] {
  const reasons: string[] = [];
  if (f.isSuperAdmin) reasons.push('this is a Super Admin account');
  if (f.otherMembers > 0) reasons.push('other team members use this firm');
  if (f.stripeSubscriptionId && !['canceled', 'expired'].includes(f.subscriptionStatus ?? '')) {
    reasons.push('the firm has a live subscription');
  }
  if (f.usageRows > 0) reasons.push('the firm has usage records');
  if (f.invoices > 0) reasons.push('the firm has invoices');
  if (f.refunds > 0) reasons.push('the firm has refunds');
  if (f.trialClaims > 0) reasons.push('the firm holds the free trial claim for a QuickBooks company');
  return reasons;
}
