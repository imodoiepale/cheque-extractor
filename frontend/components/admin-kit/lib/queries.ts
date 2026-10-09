import { useDateRange } from "../contexts/DateRangeContext";
import { useQuery } from "@tanstack/react-query";
import { callEdgeFn } from "./api";

type DateRange = { from: Date; to: Date };

export const adminKeys = {
  metrics: (range: DateRange) =>
    ["admin", "metrics", range.from.toISOString(), range.to.toISOString()] as const,
  users: {
    list: (filters: Record<string, unknown>) =>
      ["admin", "users", "list", filters] as const,
    detail: (id: string) => ["admin", "users", id] as const,
  },
  revenue: {
    stripe: (range: DateRange) =>
      ["admin", "revenue", "stripe", range.from.toISOString(), range.to.toISOString()] as const,
  },
  content: {
    feedback: (filters: Record<string, unknown>) =>
      ["admin", "content", "feedback", filters] as const,
  },
  health: () => ["admin", "health"] as const,
  runpodStats: () => ["admin", "runpod-stats"] as const,
};

export interface AdminMetrics {
  totalUsers: number;
  premiumUsers: number;
  /** Distinct paying customers by Stripe email (dedupes duplicate subscriptions). */
  paidCustomers: number;
  /** Admin-granted / comped premium (not paying). */
  grantedUsers: number;
  monthlyUsers: number;
  yearlyUsers: number;
  newSignups: number;
  activeUsers: number;
  mrrCents: number;
  arrCents: number;
  /** MRR split by plan (yearly is annual ÷ 12). */
  mrrMonthlyCents: number;
  mrrYearlyCents: number;
  activeMonthlySubs: number;
  activeYearlySubs: number;
  trialExpiringSoon: number;
  usersOnTrial: number;
  trialConversionRate: number | null;
  totalAiGenerations: number;
  feedbackCount: number;
  signupsByDay: Array<{ created_at: string }>;
  // Stripe subscription health
  activeSubsCount: number;
  uniquePayingCustomers: number;
  duplicateSubscriptions: Array<{ email: string; count: number }>;
}

export interface AdminHealth {
  ok: boolean;
  db: { ok: boolean; latencyMs: number };
  // Optional, because admin-health genuinely does not measure it — it returns
  // `stripe: { ok }` only. Declaring it required is what let the UI render
  // "undefinedms" with no type error.
  stripe: { ok: boolean; latencyMs?: number };
  timestamp: string;
}

export function useAdminMetrics() {
  const range = useDateRange();
  return useQuery({
    queryKey: adminKeys.metrics(range),
    queryFn: () => callEdgeFn<AdminMetrics>("admin-metrics", { from: range.from, to: range.to }),
    staleTime: 60_000,
  });
}

export function useAdminHealth() {
  return useQuery({
    queryKey: adminKeys.health(),
    queryFn: () => callEdgeFn<AdminHealth>("admin-health", {}),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Live RunPod account credit + measured 30-day GPU burn (admin-runpod-stats). */
export interface RunpodStats {
  balance: number | null;
  balanceError: string | null;
  gpuSeconds30d: number;
  /** Sum of RunPod's OWN billed amounts over 30d (daily_costs.runpod_actual_usd,
   *  synced from their billing API). null until the first sync. This is the
   *  truth; cost30d below is our meter, which is blind to billed-but-crashed
   *  worker boots — the failure mode that cost ~$62 on 2026-08-20/21. */
  actual30d: number | null;
  actualYesterday: number | null;
  actualDays: number;
  cost30d: number;
  dailyBurn: number;
  estDaysRemaining: number | null;
  selfhostCount30d: number;
  fallbackCount30d: number;
  fishCount30d: number;
  costPerSec: number;
}

export function useRunpodStats() {
  return useQuery({
    queryKey: adminKeys.runpodStats(),
    queryFn: () => callEdgeFn<RunpodStats>("admin-runpod-stats", {}),
    staleTime: 120_000,
  });
}
