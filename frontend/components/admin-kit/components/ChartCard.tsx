'use client';
import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

interface ChartCardProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function ChartCard({ title, description, children, actions, loading, className }: ChartCardProps) {
  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-[#0d1117] p-5", className)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-48 w-full bg-white/[0.04]" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
