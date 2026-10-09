'use client';
import React from "react";
import { Link } from "@/components/admin-kit/shim/router";
import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, Users, UserPlus, Zap, Clock, AlertTriangle, Activity, CreditCard, ArrowRight,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ChartCard } from "../components/ChartCard";
import { useAdminMetrics, useAdminHealth } from "../lib/queries";
import { ElevenLabsStatusCard } from "../components/ElevenLabsStatusCard";
import { RunpodStatusCard } from "../components/RunpodStatusCard";
import { formatCurrency, formatNumber, formatRelative } from "../lib/formatters";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#0d1117] px-3 py-2 shadow-xl">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-semibold text-white">{payload[0].value} signups</p>
    </div>
  );
}

function groupByDay(items: Array<{ created_at: string }>): Array<{ day: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const day = format(new Date(item.created_at), "MMM d");
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return Object.entries(counts).map(([day, count]) => ({ day, count }));
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;        // tailwind bg class for icon bg
  iconColor: string;     // tailwind text class for icon
  borderColor: string;   // tailwind border-l class
  loading?: boolean;
  alert?: boolean;
}

function StatCard({ label, value, sub, icon, accent, iconColor, borderColor, loading, alert }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-5 border-l-2 border-l-white/10">
        <Skeleton className="h-3 w-24 bg-white/[0.05] mb-4" />
        <Skeleton className="h-8 w-28 bg-white/[0.05] mb-2" />
        <Skeleton className="h-3 w-16 bg-white/[0.05]" />
      </div>
    );
  }
  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-[#0d1117] p-5 border-l-2", borderColor, alert && "border-red-500/40")}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">{label}</p>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", accent)}>
          <span className={cn("h-4 w-4", iconColor)}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums text-white leading-none mb-1">{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

function RevenueStrip({ data, loading }: { data?: ReturnType<typeof useAdminMetrics>["data"]; loading?: boolean }) {
  const granted = data?.grantedUsers ?? 0;
  return (
    <Link
      to="/revenue"
      className="group flex items-center gap-6 flex-wrap rounded-xl border border-emerald-500/10 bg-gradient-to-br from-emerald-950/25 to-[#0d1117] px-5 py-3 transition-colors hover:border-emerald-500/25"
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <DollarSign className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] font-medium text-emerald-400/70 uppercase tracking-widest">MRR</p>
          <p className="text-lg font-bold tabular-nums text-white leading-none">
            {loading ? "—" : formatCurrency((data?.mrrCents ?? 0) / 100)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <CreditCard className="h-4 w-4 text-sky-400" />
        </div>
        <div>
          <p className="text-[10px] font-medium text-sky-400/70 uppercase tracking-widest">Paying customers</p>
          <p className="text-lg font-bold tabular-nums text-white leading-none">
            {loading ? "—" : formatNumber(data?.paidCustomers ?? 0)}
            {granted > 0 && <span className="ml-1.5 text-[11px] font-normal text-neutral-500">+{granted} granted</span>}
          </p>
        </div>
      </div>
      <span className="ml-auto flex items-center gap-1 text-xs text-neutral-500 group-hover:text-emerald-400 transition-colors">
        Full revenue breakdown <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export default function PulsePage() {
  const { data, isLoading } = useAdminMetrics();
  const { data: health, isLoading: healthLoading } = useAdminHealth();

  const signupTrend = data?.signupsByDay ? groupByDay(data.signupsByDay) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Analytics snapshot — full financials live in Revenue" />

      {/* ── Tiny revenue strip (full breakdown in Revenue) ──────────── */}
      <RevenueStrip data={data} loading={isLoading} />

      {/* ── Analytics KPI grid ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Active Users"
          value={data ? formatNumber(data.activeUsers) : "—"}
          sub="Sessions in period"
          icon={<Activity className="h-4 w-4" />}
          accent="bg-brand/10"
          iconColor="text-brand-light"
          borderColor="border-l-brand/40"
          loading={isLoading}
        />
        <StatCard
          label="New Signups"
          value={data ? formatNumber(data.newSignups) : "—"}
          sub="Registered in period"
          icon={<UserPlus className="h-4 w-4" />}
          accent="bg-blue-500/10"
          iconColor="text-blue-400"
          borderColor="border-l-blue-500/40"
          loading={isLoading}
        />
        <StatCard
          label="Total Users"
          value={data ? formatNumber(data.totalUsers) : "—"}
          sub="All time accounts"
          icon={<Users className="h-4 w-4" />}
          accent="bg-sky-500/10"
          iconColor="text-sky-400"
          borderColor="border-l-sky-500/40"
          loading={isLoading}
        />
        <StatCard
          label="AI Generations"
          value={data ? formatNumber(data.totalAiGenerations) : "—"}
          sub="Rituals generated"
          icon={<Zap className="h-4 w-4" />}
          accent="bg-purple-500/10"
          iconColor="text-purple-400"
          borderColor="border-l-purple-500/40"
          loading={isLoading}
        />
      </div>

      {/* ── Trial row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label="Users on Trial"
          value={data ? formatNumber(data.usersOnTrial ?? 0) : "—"}
          sub="Active 7-day trials right now"
          icon={<Clock className="h-4 w-4" />}
          accent="bg-amber-500/10"
          iconColor="text-amber-400"
          borderColor="border-l-amber-500/40"
          loading={isLoading}
        />
        <StatCard
          label="Trial Expiring Soon"
          value={data ? formatNumber(data.trialExpiringSoon) : "—"}
          sub="Ending within 3 days"
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="bg-red-500/10"
          iconColor="text-red-400"
          borderColor="border-l-red-500/40"
          alert={!!data && data.trialExpiringSoon > 0}
          loading={isLoading}
        />
      </div>

      {/* ── Signups trend chart ──────────────────────────────────── */}
      <ChartCard
        title="Signups Trend"
        description="New registrations in selected period"
        loading={isLoading && !signupTrend.length}
      >
        {signupTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={signupTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" stroke="#a78bfa" strokeWidth={2} fill="url(#signupGrad)" dot={false} activeDot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[240px] text-neutral-600 text-sm">
            No signup data for this period
          </div>
        )}
      </ChartCard>

      {/* ── TTS providers ───────────────────────────────────────── */}
      {/* RunPod first: it is 94.5% of syntheses and the bulk of the audio spend,
          yet the overview showed only the 5.5% fallback. */}
      <RunpodStatusCard />
      <ElevenLabsStatusCard />

      {/* ── System health strip ─────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] px-5 py-4">
        <p className="text-xs text-neutral-500 uppercase tracking-wider mb-3">System Health</p>
        {healthLoading ? (
          <div className="flex gap-4">
            <Skeleton className="h-6 w-28 bg-white/[0.04] rounded-full" />
            <Skeleton className="h-6 w-28 bg-white/[0.04] rounded-full" />
          </div>
        ) : health ? (
          <div className="flex items-center gap-4 flex-wrap">
            {(["db", "stripe"] as const).map((service) => (
              <div
                key={service}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1 text-xs border",
                  health[service].ok
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    : "border-red-500/20 bg-red-500/5 text-red-400"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", health[service].ok ? "bg-emerald-400" : "bg-red-400")} />
                <span className="capitalize font-medium">{service}</span>
                {/* admin-health returns latencyMs for `db` but not for `stripe`,
                    so this rendered a literal "undefinedms" on the Stripe pill.
                    The AdminHealth type declares it required, which is why TS
                    never caught it. */}
                {typeof health[service].latencyMs === "number" && (
                  <span className="text-[10px] opacity-70">{health[service].latencyMs}ms</span>
                )}
              </div>
            ))}
            <span className="ml-auto text-xs text-neutral-600">Last checked {formatRelative(health.timestamp)}</span>
          </div>
        ) : (
          <p className="text-xs text-neutral-600">Health check unavailable</p>
        )}
      </div>
    </div>
  );
}
