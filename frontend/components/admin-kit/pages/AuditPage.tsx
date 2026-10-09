'use client';
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ChartCard } from "../components/ChartCard";
import { EmptyState } from "../components/EmptyState";
import { formatRelative } from "../lib/formatters";
import { supabase } from "@/components/admin-kit/shim/supabase";
import { cn } from "@/lib/utils";
import { Input } from "@/components/admin-kit/_deps/components/ui/input";
import { Badge } from "@/components/admin-kit/_deps/components/ui/badge";
import { Button } from "@/components/admin-kit/_deps/components/ui/button";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";

interface AuditLogEntry {
  id: string;
  actor_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  after: Record<string, unknown> | null;
  severity: string;
  ip: string | null;
  created_at: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  warning: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const ACTION_COLOR: Record<string, string> = {
  delete: "text-red-400",
  suspend: "text-orange-400",
  impersonate_start: "text-yellow-400",
  "moderation.remove": "text-orange-400",
  premium_grant_granted: "text-amber-300",
  premium_grant_revoked: "text-red-300",
  role_granted: "text-brand-light",
  role_revoked: "text-red-300",
};

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLOR)) {
    if (action.includes(key)) return color;
  }
  return "text-neutral-300";
}

// Group entries into Today / Yesterday / Earlier buckets for readability
function groupByDay(entries: AuditLogEntry[]): Array<{ label: string; items: AuditLogEntry[] }> {
  if (!entries.length) return [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const today: AuditLogEntry[] = [];
  const yesterday: AuditLogEntry[] = [];
  const week: AuditLogEntry[] = [];
  const earlier: AuditLogEntry[] = [];

  for (const e of entries) {
    const t = new Date(e.created_at).getTime();
    if (t >= startOfToday.getTime()) today.push(e);
    else if (t >= startOfYesterday.getTime()) yesterday.push(e);
    else if (t >= startOfWeek.getTime()) week.push(e);
    else earlier.push(e);
  }

  const groups: Array<{ label: string; items: AuditLogEntry[] }> = [];
  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (week.length) groups.push({ label: 'Last 7 days', items: week });
  if (earlier.length) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

export default function AuditPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit", search],
    queryFn: async () => {
      let query = supabase
        .from("admin_audit_logs")
        .select("id, actor_email, action, target_type, target_id, after, severity, ip, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (search) {
        query = query.or(
          `actor_email.ilike.%${search}%,action.ilike.%${search}%,target_id.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLogEntry[];
    },
    staleTime: 15_000,
  });

  function exportCsv() {
    if (!data?.length) return;
    const header = "id,actor_email,action,target_type,target_id,severity,ip,created_at";
    const rows = data.map((r) =>
      [r.id, r.actor_email, r.action, r.target_type ?? "", r.target_id ?? "", r.severity, r.ip ?? "", r.created_at]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit Log"
        description="Immutable record of every admin action"
      />

      <ChartCard
        title="All Events"
        description={data ? `${data.length} entries (most recent 200)` : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!data?.length}
            className="border-white/[0.08] bg-transparent text-neutral-400 hover:text-white hover:bg-white/[0.04] gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            <Input
              placeholder="Filter by actor, action, or target ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[#0d1117] border-white/[0.08] text-white placeholder:text-neutral-600 focus-visible:ring-brand/40"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-white/[0.03] rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Failed to load audit log"
            description="Check that you have admin access and try again."
          />
        ) : !data?.length ? (
          <EmptyState title="No audit entries" description="Actions you take will appear here." />
        ) : (
          <div className="space-y-6">
            {groupByDay(data).map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-3 mb-3 sticky top-0 bg-[#0b0f14]/80 backdrop-blur-sm py-1 z-10">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-medium">{group.label}</p>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[10px] text-neutral-700">{group.items.length}</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {group.items.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-4 py-3 first:pt-0 last:pb-0 hover:bg-white/[0.015] -mx-2 px-2 rounded transition-colors"
                    >
                      <span
                        className={cn(
                          "mt-1.5 flex-shrink-0 inline-flex h-2 w-2 rounded-full ring-2",
                          entry.severity === "critical"
                            ? "bg-red-400 ring-red-400/20 shadow-[0_0_6px] shadow-red-400/50"
                            : entry.severity === "warning"
                            ? "bg-orange-400 ring-orange-400/20"
                            : "bg-blue-400/70 ring-blue-400/10"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("text-sm font-mono font-medium", getActionColor(entry.action))}>
                            {entry.action}
                          </span>
                          {entry.severity !== "info" && (
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5 py-0 h-4", SEVERITY_STYLES[entry.severity])}
                            >
                              {entry.severity}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-neutral-500">{entry.actor_email}</span>
                          {entry.target_id && (
                            <>
                              <span className="text-neutral-700">→</span>
                              <span className="text-xs text-neutral-500 font-mono">
                                {entry.target_type && `${entry.target_type}:`}{entry.target_id.slice(0, 12)}…
                              </span>
                            </>
                          )}
                          {entry.ip && (
                            <span className="text-xs text-neutral-700 font-mono">{entry.ip}</span>
                          )}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                        {formatRelative(entry.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
