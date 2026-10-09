'use client';
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { ChartCard } from "./ChartCard";
import { callEdgeFn } from "../lib/api";
import { cn } from "@/lib/utils";
import { formatNumber } from "../lib/formatters";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

interface ElevenLabsStatus {
  connected: boolean;
  health?: "green" | "amber" | "red";
  tier?: string;
  status?: string;
  characters_used?: number;
  character_limit?: number;
  characters_remaining?: number;
  used_pct?: number;
  remaining_pct?: number;
  next_reset_unix?: number | null;
  voice_limit?: number | null;
  professional_voice_limit?: number | null;
  cloned_voice_count?: number;
  checked_at?: string;
  error?: string;
}

function formatResetDate(unix: number | null | undefined): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ElevenLabsStatusCard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "elevenlabs-status"],
    queryFn: () => callEdgeFn<ElevenLabsStatus>("admin-elevenlabs-status", {}),
    staleTime: 5 * 60_000, // 5 min
    refetchInterval: 5 * 60_000,
  });

  const isError = data && (!data.connected || data.error);
  const health = data?.health ?? "green";

  return (
    <ChartCard
      title="ElevenLabs"
      /* Not the TTS provider any more, and saying so matters: it appears in no
         engine chain (default, onboarding or pregen — see the Voice Lab), so
         every narration users hear comes from RunPod or Fish Audio. What it
         still does is hold the cloned voices, and the character quota below is
         a cloning quota, not a narration one. The card stays for that reason
         and no other. */
      description="Voice cloning only — serves no narration"
      actions={
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 rounded-md px-2 text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
          aria-label="Refresh ElevenLabs status"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40 bg-white/[0.04]" />
          <Skeleton className="h-3 w-full bg-white/[0.04]" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 bg-white/[0.04]" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-300">Not connected</p>
              <p className="mt-1 text-xs text-neutral-400">
                {data?.error ?? "ElevenLabs API key is missing or invalid."}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Run{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px]">
                  supabase secrets set ELEVENLABS_API_KEY=…
                </code>
              </p>
            </div>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Connection + plan tier */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 ring-1 ring-emerald-500/30">
                <Mic size={15} className="text-emerald-300" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                  Connected
                  <CheckCircle2 size={12} className="text-emerald-400" />
                </p>
                <p className="text-[11px] text-neutral-500">
                  Plan:{" "}
                  <span className="font-medium text-neutral-300 capitalize">
                    {data.tier}
                  </span>
                  {data.status && data.status !== "active" && (
                    <span className="ml-2 text-amber-300">· {data.status}</span>
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
              {health === "green"
                ? "Healthy"
                : health === "amber"
                  ? "Low"
                  : "Critical"}
            </div>
          </div>

          {/* Credits progress bar */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] tracking-wider text-neutral-500 uppercase">
                Character Credits
              </span>
              <span className="text-xs text-neutral-300 tabular-nums">
                {formatNumber(data.characters_remaining ?? 0)} /{" "}
                {formatNumber(data.character_limit ?? 0)} left
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className={cn(
                  "h-full w-full origin-left rounded-full transition-transform duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
                  health === "green"
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                    : health === "amber"
                      ? "bg-gradient-to-r from-amber-500 to-amber-400"
                      : "bg-gradient-to-r from-red-500 to-red-400"
                )}
                style={{ transform: `scaleX(${(data.used_pct ?? 0) / 100})` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-600">
              <span>{formatNumber(data.characters_used ?? 0)} used</span>
              <span>{data.used_pct}%</span>
            </div>
          </div>

          {/* Sub-stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-3 text-center">
              <p className="text-lg font-bold text-brand-light tabular-nums">
                {data.cloned_voice_count ?? 0}
              </p>
              <p className="mt-0.5 text-[9px] tracking-wider text-neutral-500 uppercase">
                Cloned voices
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-3 text-center">
              <p className="text-lg font-bold text-emerald-300 tabular-nums">
                {data.voice_limit ?? "∞"}
              </p>
              <p className="mt-0.5 text-[9px] tracking-wider text-neutral-500 uppercase">
                Voice slots
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-3 text-center">
              <p className="mt-1 text-xs leading-none font-bold text-amber-300 tabular-nums">
                {formatResetDate(data.next_reset_unix)}
              </p>
              <p className="mt-1 text-[9px] tracking-wider text-neutral-500 uppercase">
                Resets
              </p>
            </div>
          </div>

          {/* Warning banner when low */}
          {health !== "green" && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3",
                health === "amber"
                  ? "border-amber-500/25 bg-amber-500/5"
                  : "border-red-500/25 bg-red-500/5"
              )}
            >
              <AlertTriangle
                size={14}
                className={cn(
                  "mt-0.5 shrink-0",
                  health === "amber" ? "text-amber-400" : "text-red-400"
                )}
              />
              <div>
                <p
                  className={cn(
                    "text-xs font-medium",
                    health === "amber" ? "text-amber-200" : "text-red-200"
                  )}
                >
                  {health === "amber"
                    ? `Only ${data.remaining_pct}% credits remaining`
                    : `Critical — ${data.remaining_pct}% credits left`}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Upgrade your plan at{" "}
                  <a
                    href="https://elevenlabs.io/app/subscription"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-light underline hover:text-brand-light"
                  >
                    elevenlabs.io/app/subscription
                  </a>{" "}
                  before {formatResetDate(data.next_reset_unix)} to avoid TTS
                  failures.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </ChartCard>
  );
}
