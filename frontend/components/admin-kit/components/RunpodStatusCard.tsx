'use client';
import React from "react";
import { Cpu, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { ChartCard } from "./ChartCard";
import { useRunpodStats } from "../lib/queries";
import { cn } from "@/lib/utils";
import { formatNumber } from "../lib/formatters";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

/**
 * RunPod on the overview page.
 *
 * RunPod is the primary TTS engine — measured over 30 days it produced 1,329 of
 * 1,406 syntheses (94.5%), with ElevenLabs as a 5.5% fallback. Yet the overview
 * showed an ElevenLabs card and nothing at all for RunPod, so the provider doing
 * almost all the work, and carrying almost all the cost, was invisible on the
 * page you look at first.
 *
 * Deliberately mirrors ElevenLabsStatusCard: same ChartCard shell, same refresh
 * affordance, same health pill. It also fetches its own data (useRunpodStats,
 * which already existed and was used only by UsagePage) because live balance and
 * runway come from the RunPod API and are not in admin-metrics.
 */
function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function hours(gpuSeconds: number | null | undefined): string {
  if (!gpuSeconds) return "0h";
  const h = gpuSeconds / 3600;
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(gpuSeconds / 60)}m`;
}

export function RunpodStatusCard() {
  const { data, isLoading, refetch, isFetching } = useRunpodStats();

  // Runway is the number that matters: GPU work stops dead when credit runs
  // out, and unlike a monthly plan there is no grace period.
  const days = data?.estDaysRemaining ?? null;
  const health: "green" | "amber" | "red" =
    days === null ? "green" : days < 7 ? "red" : days < 21 ? "amber" : "green";
  const balanceUnavailable = !!data?.balanceError;

  return (
    <ChartCard
      title="RunPod"
      description="Self-hosted TTS (OmniVoice) — GPU spend + credit runway"
      actions={
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 rounded-md px-2 text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
          aria-label="Refresh RunPod status"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40 bg-white/[0.04]" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 bg-white/[0.04]" />
            ))}
          </div>
        </div>
      ) : !data ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-300">Not reachable</p>
              <p className="mt-1 text-xs text-neutral-400">
                admin-runpod-stats did not respond.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/30">
                <Cpu size={15} className="text-brand-light" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                  Primary TTS
                  <CheckCircle2 size={12} className="text-emerald-400" />
                </p>
                <p className="text-[11px] text-neutral-500">
                  {formatNumber(data.selfhostCount30d ?? 0)} syntheses · 30d
                  {/* Named by the engine that actually served, not by the one
                      that used to. This line said "fell back to ElevenLabs" for
                      every non-RunPod synthesis, while ElevenLabs sits in no
                      engine chain and Fish Audio is what catches them — so the
                      overview was reporting spend against the wrong provider. */}
                  {(data.fishCount30d ?? 0) > 0 && (
                    <span className="ml-2 text-amber-300">
                      · {formatNumber(data.fishCount30d)} to Fish Audio
                    </span>
                  )}
                  {data.fallbackCount30d > 0 && (
                    <span className="ml-2 text-amber-300">
                      · {formatNumber(data.fallbackCount30d)} to ElevenLabs
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "rounded-full border px-2 py-1 text-[10px] font-medium tracking-wider uppercase",
                health === "green"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : health === "amber"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
              )}
            >
              {days === null ? "Live" : health === "green" ? "Healthy" : health === "amber" ? "Low" : "Critical"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] tracking-wider text-neutral-500 uppercase">Balance</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {balanceUnavailable ? "—" : money(data.balance)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] tracking-wider text-neutral-500 uppercase">
                {data.actual30d !== null ? "Spend · 30d" : "GPU · 30d"}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {data.actual30d !== null ? money(data.actual30d) : hours(data.gpuSeconds30d)}
              </p>
              <p className="text-[10px] text-neutral-500">
                {data.actual30d !== null
                  ? `billed · ${money(data.cost30d)} metered est.`
                  : money(data.cost30d)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] tracking-wider text-neutral-500 uppercase">Runway</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {days === null ? "—" : `${days}d`}
              </p>
              <p className="text-[10px] text-neutral-500">{money(data.dailyBurn)}/day</p>
            </div>
          </div>

          {/* Drift: RunPod billed far more than our meter recorded. The meter
              only prices successful jobs' executionTime, so crash-looping
              workers (billed boots, no execution) show up ONLY here. This gap
              is the exact signature of the 2026-08-20/21 $62 incident. */}
          {data.actual30d !== null && data.actual30d > data.cost30d * 1.5 && data.actual30d - data.cost30d > 3 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">
                  RunPod billed {money(data.actual30d)} over 30 days but metered work
                  accounts for only {money(data.cost30d)}. The difference is usually
                  workers booting and crashing (billed, never executing) — check for an
                  endpoint with queued jobs and 0 ready workers.
                </p>
              </div>
            </div>
          )}

          {balanceUnavailable && (
            <p className="text-[11px] text-neutral-500">
              Live balance unavailable ({data.balanceError}). Spend figures below are
              computed from recorded GPU time and are unaffected.
            </p>
          )}

          {days !== null && days < 7 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
                <p className="text-xs text-red-300">
                  About {days} days of credit left. When it runs out, guidance audio
                  stops generating — top up before that.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
