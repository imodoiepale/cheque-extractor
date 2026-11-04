/** What each tenant_usage_state() block_reason means, in the user's words. Safe on client and server. */
export function blockReasonMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'trial_check_limit_reached':
      return 'Your free trial has used all 250 cheques. Your history stays available.';
    case 'trial_expired':
      return 'Your 14-day free trial has ended. Your history stays available.';
    case 'realm_trial_already_used':
      // Migration 037: one trial per QuickBooks company. Say which rule was hit,
      // otherwise this reads as a bug to someone on day one.
      return 'This QuickBooks company has already used its free trial. Choose a plan to continue. Your history stays available.';
    default:
      return 'Processing is disabled for this account. Your history stays available.';
  }
}
