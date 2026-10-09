'use client';
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, ExternalLink, Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { callEdgeFn } from "../lib/api";
import { formatCurrency } from "../lib/formatters";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/admin-kit/_deps/components/ui/skeleton";
import { TransactionDetailDrawer, failureReason, type ChargeLike } from "../components/TransactionDetailDrawer";

/* ─── Types ─── */
interface StripeCustomerExpanded {
  id: string;
  email: string | null;
  name: string | null;
}
interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  description: string | null;
  receipt_email: string | null;
  customer: StripeCustomerExpanded | string | null;
  billing_details?: { email: string | null; name: string | null };
  refunded: boolean;
  disputed: boolean;
  receipt_url?: string | null;
  metadata?: Record<string, string>;
  // Failure / card / outcome details (live from Stripe — used for the reason + drawer)
  failure_code?: string | null;
  failure_message?: string | null;
  outcome?: { type?: string; reason?: string | null; seller_message?: string | null; network_status?: string | null } | null;
  payment_method_details?: { type?: string; card?: { brand?: string; last4?: string; funding?: string; country?: string } } | null;
}
interface StripeChargesResponse {
  data: StripeCharge[];
  has_more: boolean;
}

/* ─── Helpers ─── */
function getEmail(c: StripeCharge): string {
  const expanded = typeof c.customer === "object" && c.customer !== null ? c.customer.email : null;
  return expanded ?? c.receipt_email ?? c.billing_details?.email ?? "—";
}

function getInitials(email: string) {
  if (email === "—") return "?";
  return email.slice(0, 2).toUpperCase();
}

const STATUS_FILTERS = ["all", "succeeded", "failed", "pending", "refunded"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const statusStyle: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
  refunded:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function exportCsv(charges: StripeCharge[]) {
  const header = "Date,Customer,Amount,Currency,Status,Charge ID";
  const rows = charges.map((c) => [
    format(new Date(c.created * 1000), "yyyy-MM-dd"),
    getEmail(c),
    (c.amount / 100).toFixed(2),
    c.currency.toUpperCase(),
    c.refunded ? "refunded" : c.status,
    c.id,
  ].map((v) => `"${v}"`).join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Page ─── */
export default function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<StripeCharge | null>(null);

  const query = useQuery({
    queryKey: ["admin", "stripe", "charges", "all"],
    queryFn: () => callEdgeFn<StripeChargesResponse>("admin-stripe-query", { resource: "charges", limit: 100 }),
    staleTime: 60_000,
  });

  const charges = query.data?.data ?? [];

  const filtered = useMemo(() => {
    let list = charges;
    if (statusFilter !== "all") {
      list = list.filter((c) => {
        const effective = c.refunded ? "refunded" : c.status;
        return effective === statusFilter;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => {
        const email = getEmail(c).toLowerCase();
        return email.includes(q) || c.id.toLowerCase().includes(q);
      });
    }
    return list;
  }, [charges, search, statusFilter]);

  const succeededTotal = charges
    .filter((c) => c.status === "succeeded" && !c.refunded)
    .reduce((s, c) => s + c.amount / 100, 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Transactions"
          description="All Stripe charges — search, filter, and export"
        />
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
        >
          <Download className="h-3 w-3" />
          Export CSV
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Charges", value: query.data ? String(charges.length) : "—" },
          { label: "Succeeded", value: query.data ? String(charges.filter((c) => c.status === "succeeded" && !c.refunded).length) : "—" },
          { label: "Total Collected", value: query.data ? formatCurrency(succeededTotal) : "—" },
          { label: "Refunded / Failed", value: query.data ? String(charges.filter((c) => c.refunded || c.status === "failed").length) : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-white/[0.06] bg-[#0d1117] p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xl font-bold text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Search by email or charge ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-9 pr-4 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-colors"
          />
        </div>
        {/* Status tabs */}
        <div className="flex gap-1 p-1 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                statusFilter === s
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                  : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0d1117] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-neutral-600">
          <span>Customer</span>
          <span className="w-28 text-right">Date</span>
          <span className="w-24 text-right">Amount</span>
          <span className="w-24 text-center">Status</span>
          <span className="w-10" />
        </div>

        {/* Rows */}
        {query.isLoading ? (
          <div className="divide-y divide-white/[0.04]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full bg-white/[0.04]" />
                  <Skeleton className="h-4 w-40 bg-white/[0.04]" />
                </div>
                <Skeleton className="h-4 w-24 bg-white/[0.04]" />
                <Skeleton className="h-4 w-16 bg-white/[0.04]" />
                <Skeleton className="h-6 w-20 rounded-full bg-white/[0.04]" />
                <Skeleton className="h-4 w-4 bg-white/[0.04]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-600">
            <p className="text-sm">No transactions match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((charge) => {
              const email = getEmail(charge);
              const status = charge.refunded ? "refunded" : charge.status;
              const stripeUrl = `https://dashboard.stripe.com/payments/${charge.id}`;
              const reason = failureReason(charge);
              return (
                <div
                  key={charge.id}
                  onClick={() => setSelected(charge)}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group cursor-pointer"
                >
                  {/* Customer */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-xs font-bold text-indigo-300">
                      {getInitials(email)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-neutral-200 truncate">{email}</p>
                        {charge.metadata?.label === "test" && (
                          <span className="shrink-0 rounded-full bg-neutral-700/50 border border-neutral-600/40 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                            test
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-600 font-mono truncate">{charge.id}</p>
                      {reason && status === "failed" && (
                        <p className="text-[11px] text-red-400/80 truncate">{reason}</p>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <span className="w-28 text-right text-sm text-neutral-400 tabular-nums">
                    {format(new Date(charge.created * 1000), "MMM d, yyyy")}
                  </span>

                  {/* Amount */}
                  <span className="w-24 text-right text-sm font-semibold text-white tabular-nums">
                    {formatCurrency(charge.amount / 100)}
                  </span>

                  {/* Status */}
                  <span className={cn(
                    "w-24 text-center rounded-full px-2.5 py-1 text-xs font-medium border",
                    statusStyle[status] ?? "bg-white/[0.04] text-neutral-400 border-white/[0.08]"
                  )}>
                    {status}
                  </span>

                  {/* Stripe link */}
                  <a
                    href={stripeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-10 flex justify-center text-neutral-700 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="View in Stripe"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!query.isLoading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-white/[0.04] flex items-center justify-between">
            <p className="text-xs text-neutral-600">
              Showing {filtered.length} of {charges.length} charges
            </p>
            {query.data?.has_more && (
              <p className="text-xs text-amber-500/70">More charges exist in Stripe — increase the limit to see all</p>
            )}
          </div>
        )}
      </div>

      <TransactionDetailDrawer charge={selected as ChargeLike | null} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
