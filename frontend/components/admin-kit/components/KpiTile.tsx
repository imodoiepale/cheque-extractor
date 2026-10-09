'use client';
import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

interface KpiTileProps {
  label: string;
  value: string | number;
  delta?: number; // percentage change
  suffix?: string;
  loading?: boolean;
  onClick?: () => void;
  sparkline?: React.ReactNode;
}

export function KpiTile({ label, value, delta, suffix, loading, onClick, sparkline }: KpiTileProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-5">
        <Skeleton className="h-4 w-20 bg-white/[0.06] mb-3" />
        <Skeleton className="h-8 w-32 bg-white/[0.06] mb-2" />
        <Skeleton className="h-3 w-16 bg-white/[0.06]" />
      </div>
    );
  }

  const isPositive = delta !== undefined && delta > 0;
  const isNegative = delta !== undefined && delta < 0;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border border-white/[0.06] bg-[#0d1117] p-5 text-left transition-[color,background-color,border-color,box-shadow,opacity,transform]",
        onClick && "hover:border-white/[0.12] hover:bg-[#12171d] cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs text-neutral-500 uppercase tracking-wider">{label}</p>
        {sparkline && <div className="opacity-60">{sparkline}</div>}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-white">
        {value}
        {suffix && <span className="ml-1 text-lg font-normal text-neutral-400">{suffix}</span>}
      </p>
      {delta !== undefined && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 text-xs",
            isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-neutral-500"
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : isNegative ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          <span>{Math.abs(delta).toFixed(1)}% vs last period</span>
        </div>
      )}
    </button>
  );
}
